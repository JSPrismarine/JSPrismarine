import { loadDatapack } from './datapack';
import type { Diagnostic, DiagnosticSeverity } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { FormatVersion } from './formatVersion';
import { parseVersion } from './formatVersion';
import type { JavaRegistryId } from './javaRegistries';
import { parseLenientJson } from './lenientJson';
import { parseManifest } from './manifest';
import type { RegistryId } from './registries';
import { identifierForDefinition, routeForPath } from './registries';
import type { PackFiles, PackStack } from './sources';
import { expandSource } from './sources';
import type { DefinitionValidator } from './validation';
import { structuralValidator } from './validation';

/** One winning definition after the stack is composed. */
export interface Definition {
    /** The identifier the definition is registered under; a pack-relative path for the path-addressed registries. */
    identifier: string;
    registry: RegistryId | JavaRegistryId;
    /** The name of the pack the winning definition came from. */
    pack: string;
    /** The pack-relative path of the file. */
    path: string;
    /** The file's parsed `format_version`, when it declares one. */
    formatVersion?: FormatVersion;
    /** The parsed definition, replaced whole by a later pack, never merged. */
    data: unknown;
}

/** The composed result of a load: per registry, identifier to winning definition. */
export type Definitions = Readonly<Record<RegistryId | JavaRegistryId, ReadonlyMap<string, Definition>>>;

/** The mutable registries the loaders fill while a stack composes. */
export type DefinitionRegistries = Record<RegistryId | JavaRegistryId, Map<string, Definition>>;

/** Options for {@link load}. */
export interface LoadOptions {
    /** Fail the load when an error is reported, instead of reporting and continuing. Warnings never fail it. */
    strict?: boolean;
    /** Replaces the structural validator, so schema-based validation can take over. */
    validator?: DefinitionValidator;
}

/** What {@link load} returns: the composed definitions plus the full report. */
export interface LoadResult {
    definitions: Definitions;
    diagnostics: readonly Diagnostic[];
}

/** Error thrown by a strict load; `diagnostics` holds the full report, warnings included. */
export class PackLoadError extends Error {
    public override name = 'PackLoadError';

    public constructor(public readonly diagnostics: readonly Diagnostic[]) {
        const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
        super(`the pack stack did not load cleanly: ${errors.length} error(s), first: ${errors[0]?.message}`);
    }
}

const MCB_MAGIC = [0x7f, 0x4d, 0x43, 0x42] as const;

const isMcb = (bytes: Uint8Array): boolean =>
    bytes.length >= MCB_MAGIC.length && MCB_MAGIC.every((byte, i) => bytes[i] === byte);

const decoder = new TextDecoder();

/** One stack member after expansion: the Bedrock packs it holds, or a datapack still to read. */
type StackUnit =
    | { kind: 'bedrock'; packs: readonly PackFiles[]; diagnostics: readonly Diagnostic[] }
    | { kind: 'datapack'; path: string };

/**
 * Expands the Bedrock members of a stack, keeping stack order and keeping
 * each member's own diagnostics with it, so the report reads in stack order
 * even though every Bedrock pack is known before the first one loads.
 */
const expandStack = (stack: PackStack): StackUnit[] =>
    stack.map((source) => {
        if (source.kind === 'datapack') return { kind: 'datapack', path: source.path };
        const diagnostics: Diagnostic[] = [];
        return { kind: 'bedrock', packs: expandSource(source, diagnostics), diagnostics };
    });

/**
 * Maps each Bedrock pack-relative path to the last pack in the stack that
 * provides it, which is the pack whose copy of the file the composed result
 * uses.
 */
const lastProviderOfPath = (units: readonly StackUnit[]): Map<string, PackFiles> => {
    const providers = new Map<string, PackFiles>();
    for (const unit of units) {
        if (unit.kind !== 'bedrock') continue;
        for (const pack of unit.packs) {
            for (const path of pack.files.keys()) providers.set(path, pack);
        }
    }
    return providers;
};

/**
 * Loads a pack stack into one `Definitions` object plus a diagnostics report.
 * Packs apply in stack order and a later pack wins by identifier: its
 * definition replaces the earlier one whole, never merged. A pack whose
 * manifest does not validate is skipped and reported.
 *
 * A Bedrock file that does not parse is an error, except when a later pack in
 * the stack provides the same pack-relative path. That copy replaces this one
 * whole, so the broken file cannot reach the composed result and is reported
 * as a warning instead, which keeps a strict load from failing over a file
 * nothing reads. The vanilla layers rely on it: two of them ship an
 * `entities/npc.json` that only patches a saved pack, and a later layer
 * carries the real one. The Java half has no equivalent rule, because its
 * tags merge across packs rather than replacing one another.
 *
 * @throws {PackLoadError} In strict mode, when an error is reported. A
 *   warning never fails the load.
 */
export const load = (stack: PackStack, options: LoadOptions = {}): LoadResult => {
    const validator = options.validator ?? structuralValidator;
    const collector = new DiagnosticCollector();
    const registries: DefinitionRegistries = {
        blocks: new Map(),
        items: new Map(),
        entities: new Map(),
        lootTables: new Map(),
        tradeTables: new Map(),
        spawnRules: new Map(),
        recipes: new Map(),
        biomes: new Map(),
        features: new Map(),
        featureRules: new Map(),
        itemCatalog: new Map(),
        lootTablesJava: new Map(),
        recipesJava: new Map(),
        advancements: new Map(),
        tags: new Map(),
        enchantments: new Map(),
        damageTypes: new Map(),
        predicates: new Map(),
        itemModifiers: new Map(),
        functions: new Map()
    };

    const units = expandStack(stack);
    const lastProvider = lastProviderOfPath(units);

    for (const unit of units) {
        if (unit.kind === 'datapack') {
            loadDatapack(unit.path, registries, validator, collector);
            continue;
        }

        for (const diagnostic of unit.diagnostics) collector.add(diagnostic);

        for (const pack of unit.packs) {
            const packName = loadManifest(pack.origin, pack.files.get('manifest.json'), collector);
            if (packName === undefined) continue;

            for (const [path, bytes] of pack.files) {
                const superseded = lastProvider.get(path) !== pack;
                loadDefinitionFile(registries, packName, path, bytes, superseded, validator, collector);
            }
        }
    }

    const failed = collector.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (options.strict && failed) throw new PackLoadError(collector.diagnostics);

    return { definitions: registries, diagnostics: collector.diagnostics };
};

/** Parses and validates a pack's manifest; returns the pack name, or undefined to skip the pack. */
const loadManifest = (
    origin: string,
    bytes: Uint8Array | undefined,
    collector: DiagnosticCollector
): string | undefined => {
    if (!bytes) {
        collector.add({
            severity: 'error',
            code: 'manifest.missing',
            pack: origin,
            message: 'the pack has no manifest.json'
        });
        return undefined;
    }

    let parsed: unknown;
    try {
        parsed = parseLenientJson(decoder.decode(bytes));
    } catch (error) {
        collector.add({
            severity: 'error',
            code: 'manifest.invalid',
            pack: origin,
            path: 'manifest.json',
            message: error instanceof Error ? error.message : String(error)
        });
        return undefined;
    }

    const { manifest, diagnostics } = parseManifest(parsed, origin);
    for (const diagnostic of diagnostics) collector.add(diagnostic);
    return manifest?.header.name;
};

/**
 * Parses, validates and registers one definition file; the latest pack wins
 * by identifier. A file a later pack supersedes reports its parse failures as
 * warnings, because its content never reaches the composed result.
 */
const loadDefinitionFile = (
    registries: DefinitionRegistries,
    pack: string,
    path: string,
    bytes: Uint8Array,
    superseded: boolean,
    validator: DefinitionValidator,
    collector: DiagnosticCollector
): void => {
    /** Downgrades a parse failure to a warning when a later pack supersedes the file. */
    const severityOf = (severity: DiagnosticSeverity): DiagnosticSeverity =>
        superseded && severity === 'error' ? 'warning' : severity;
    const note = superseded ? '; a later pack supersedes this file' : '';

    const registry = routeForPath(path);
    if (!registry) return;

    if (isMcb(bytes)) {
        collector.add({
            severity: 'warning',
            code: 'definition.mcb',
            pack,
            path,
            message: 'binary MCB files are not readable; take this file from bedrock-samples instead'
        });
        return;
    }

    let data: unknown;
    try {
        data = parseLenientJson(decoder.decode(bytes));
    } catch (error) {
        collector.add({
            severity: severityOf('error'),
            code: 'definition.invalid-json',
            pack,
            path,
            message: `${error instanceof Error ? error.message : String(error)}${note}`
        });
        return;
    }

    let failed = false;
    for (const finding of validator({ registry, path, data })) {
        const severity = severityOf(finding.severity);
        collector.add({ ...finding, severity, message: `${finding.message}${note}`, pack, path });
        failed ||= finding.severity === 'error';
    }
    if (failed) return;

    const identifier = identifierForDefinition(registry, path, data);
    if (identifier === undefined) {
        collector.add({
            severity: severityOf('error'),
            code: 'definition.no-identifier',
            pack,
            path,
            message: `the file declares no description.identifier${note}`
        });
        return;
    }

    const record: Record<string, unknown> | undefined =
        typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data } : undefined;
    const formatVersion = record ? parseVersion(record.format_version) : undefined;

    registries[registry].set(identifier, { identifier, registry, pack, path, formatVersion, data });
};
