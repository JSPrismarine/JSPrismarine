import { loadDatapack } from './datapack';
import type { Diagnostic } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { FormatVersion } from './formatVersion';
import { parseVersion } from './formatVersion';
import type { JavaRegistryId } from './javaRegistries';
import { parseLenientJson } from './lenientJson';
import { parseManifest } from './manifest';
import type { RegistryId } from './registries';
import { identifierForDefinition, routeForPath } from './registries';
import type { PackStack } from './sources';
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
    /** Fail the load when any diagnostic is reported, instead of reporting and continuing. */
    strict?: boolean;
    /** Replaces the structural validator, so schema-based validation can take over. */
    validator?: DefinitionValidator;
}

/** What {@link load} returns: the composed definitions plus the full report. */
export interface LoadResult {
    definitions: Definitions;
    diagnostics: readonly Diagnostic[];
}

/** Error thrown by a strict load; `diagnostics` holds the full report. */
export class PackLoadError extends Error {
    public override name = 'PackLoadError';

    public constructor(public readonly diagnostics: readonly Diagnostic[]) {
        super(
            `the pack stack did not load cleanly: ${diagnostics.length} diagnostic(s), first: ${diagnostics[0]?.message}`
        );
    }
}

const MCB_MAGIC = [0x7f, 0x4d, 0x43, 0x42] as const;

const isMcb = (bytes: Uint8Array): boolean =>
    bytes.length >= MCB_MAGIC.length && MCB_MAGIC.every((byte, i) => bytes[i] === byte);

const decoder = new TextDecoder();

/**
 * Loads a pack stack into one `Definitions` object plus a diagnostics report.
 * Packs apply in stack order and a later pack wins by identifier: its
 * definition replaces the earlier one whole, never merged. A pack whose
 * manifest does not validate is skipped and reported.
 *
 * @throws {PackLoadError} In strict mode, when any diagnostic is reported.
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
        itemModifiers: new Map()
    };

    for (const source of stack) {
        if (source.kind === 'datapack') {
            loadDatapack(source.path, registries, validator, collector);
            continue;
        }

        const sourceDiagnostics: Diagnostic[] = [];
        const packs = expandSource(source, sourceDiagnostics);
        for (const diagnostic of sourceDiagnostics) collector.add(diagnostic);

        for (const pack of packs) {
            const packName = loadManifest(pack.origin, pack.files.get('manifest.json'), collector);
            if (packName === undefined) continue;

            for (const [path, bytes] of pack.files) {
                loadDefinitionFile(registries, packName, path, bytes, validator, collector);
            }
        }
    }

    if (options.strict && collector.diagnostics.length > 0) throw new PackLoadError(collector.diagnostics);

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

/** Parses, validates and registers one definition file; the latest pack wins by identifier. */
const loadDefinitionFile = (
    registries: DefinitionRegistries,
    pack: string,
    path: string,
    bytes: Uint8Array,
    validator: DefinitionValidator,
    collector: DiagnosticCollector
): void => {
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
            severity: 'error',
            code: 'definition.invalid-json',
            pack,
            path,
            message: error instanceof Error ? error.message : String(error)
        });
        return;
    }

    let failed = false;
    for (const finding of validator({ registry, path, data })) {
        collector.add({ ...finding, pack, path });
        failed ||= finding.severity === 'error';
    }
    if (failed) return;

    const identifier = identifierForDefinition(registry, path, data);
    if (identifier === undefined) {
        collector.add({
            severity: 'error',
            code: 'definition.no-identifier',
            pack,
            path,
            message: 'the file declares no description.identifier'
        });
        return;
    }

    const record: Record<string, unknown> | undefined =
        typeof data === 'object' && data !== null && !Array.isArray(data) ? { ...data } : undefined;
    const formatVersion = record ? parseVersion(record.format_version) : undefined;

    registries[registry].set(identifier, { identifier, registry, pack, path, formatVersion, data });
};
