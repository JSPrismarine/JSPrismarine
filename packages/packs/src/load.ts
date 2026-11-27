import { loadDatapack } from './datapack';
import type { Diagnostic, DiagnosticSeverity } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { FormatVersion } from './formatVersion';
import { parseVersion } from './formatVersion';
import { DEFAULT_JAVA_DATA_TARGET } from './javaDataTarget';
import type { JavaDataTarget } from './javaDataTarget';
import type { JavaRegistryId } from './javaRegistries';
import { parseLenientJson } from './lenientJson';
import { parseManifest } from './manifest';
import type { RegistryId } from './registries';
import { identifierForDefinition, isPathAddressedRegistry, routeForPath } from './registries';
import type { PrefixCacheOptions } from './prefixCache';
import { prefixCacheKeyFor, readPrefixCache, writePrefixCache } from './prefixCache';
import type { PackFileFilter, PackFiles, PackStack } from './sources';
import { expandSource } from './sources';
import type { DefinitionValidator } from './validation';
import { structuralValidator } from './validation';
import { PacksErrors } from '@jsprismarine/errors/packs';

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
    /**
     * The `min_engine_version` of the pack the definition came from, when its manifest declares
     * one. The engine versions the pack's Molang by it.
     */
    minEngineVersion?: FormatVersion;
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
    /** Caches an immutable leading prefix as one V8 file, then composes later sources on every load. */
    cache?: PrefixCacheOptions;
    /**
     * The Java release the datapacks are read for. Its data pack format gates each datapack's
     * `pack.mcmeta` range and overlays. Defaults to `DEFAULT_JAVA_DATA_TARGET`.
     */
    java?: JavaDataTarget;
}

/** What {@link load} returns: the composed definitions plus the full report. */
export interface LoadResult {
    definitions: Definitions;
    diagnostics: readonly Diagnostic[];
}

/** Error thrown by a strict load; `diagnostics` holds the full report, warnings included. */
export class PackLoadError extends PacksErrors.PackStackDidNotLoadCleanly {
    public override name = 'PackLoadError';

    public constructor(public readonly diagnostics: readonly Diagnostic[]) {
        const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
        super({ count: errors.length, first: errors[0]?.message });
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
 * The files this loader can do anything with.
 *
 * {@link loadDefinitionFile} drops a path no registry owns, so reading one is
 * work with no result. Saying so up front keeps the textures, the `.nbt`
 * structures and the 3 MB `level.dat` of the composed vanilla pack from being
 * opened at all, which is a third of the Bedrock half's files.
 */
const routable: PackFileFilter = (path) => routeForPath(path) !== undefined;

/**
 * Expands the Bedrock members of a stack, keeping stack order and keeping
 * each member's own diagnostics with it, so the report reads in stack order
 * even though every Bedrock pack is known before the first one loads.
 */
const expandStack = (stack: PackStack): StackUnit[] =>
    stack.map((source) => {
        if (source.kind === 'datapack') return { kind: 'datapack', path: source.path };
        const diagnostics: Diagnostic[] = [];
        return { kind: 'bedrock', packs: expandSource(source, diagnostics, routable), diagnostics };
    });

/**
 * Finds packs whose manifests allow them to participate in the stack.
 * A later malformed pack cannot supersede an earlier file.
 */
const packsWithLoadableManifest = (units: readonly StackUnit[]): Set<PackFiles> => {
    const loadable = new Set<PackFiles>();
    for (const unit of units) {
        if (unit.kind !== 'bedrock') continue;
        for (const pack of unit.packs) {
            const bytes = pack.files.get('manifest.json');
            if (!bytes) continue;
            try {
                const parsed = parseLenientJson(decoder.decode(bytes));
                if (parseManifest(parsed, pack.origin).manifest !== undefined) loadable.add(pack);
            } catch {
                // loadManifest reports parse failures during the ordered load below.
            }
        }
    }
    return loadable;
};

/**
 * Maps each Bedrock pack-relative path to the last pack in the stack that
 * provides it, which is the pack whose copy of the file the composed result
 * uses.
 */
const lastProviderOfPath = (
    units: readonly StackUnit[],
    loadablePacks: ReadonlySet<PackFiles>
): Map<string, PackFiles> => {
    const providers = new Map<string, PackFiles>();
    for (const unit of units) {
        if (unit.kind !== 'bedrock') continue;
        for (const pack of unit.packs) {
            if (!loadablePacks.has(pack)) continue;
            // A binary definition this loader cannot read provides nothing, so it must not shadow
            // the readable copy of the same path in an earlier pack.
            for (const [path, bytes] of pack.files) if (!isMcb(bytes)) providers.set(path, pack);
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
const emptyRegistries = (): DefinitionRegistries => ({
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
    blockTransformers: new Map(),
    lootTablesJava: new Map(),
    recipesJava: new Map(),
    advancements: new Map(),
    tags: new Map(),
    enchantments: new Map(),
    damageTypes: new Map(),
    predicates: new Map(),
    itemModifiers: new Map(),
    slotSources: new Map(),
    functions: new Map(),
    dimensionTypes: new Map(),
    paintingVariants: new Map(),
    enchantmentProviders: new Map(),
    bannerPatterns: new Map(),
    instruments: new Map(),
    jukeboxSongs: new Map(),
    trimPatterns: new Map(),
    trimMaterials: new Map(),
    decoratedPotPatterns: new Map(),
    catVariants: new Map(),
    catSoundVariants: new Map(),
    chickenVariants: new Map(),
    chickenSoundVariants: new Map(),
    cowVariants: new Map(),
    cowSoundVariants: new Map(),
    frogVariants: new Map(),
    pigVariants: new Map(),
    pigSoundVariants: new Map(),
    wolfVariants: new Map(),
    wolfSoundVariants: new Map(),
    zombieNautilusVariants: new Map(),
    sulfurCubeArchetypes: new Map(),
    villagerTrades: new Map(),
    tradeSets: new Map(),
    trialSpawners: new Map(),
    timelines: new Map(),
    worldClocks: new Map(),
    dispenseBehaviors: new Map(),
    blockSoundSets: new Map(),
    dimensions: new Map(),
    worldgen: new Map()
});

const composeUnits = (
    units: readonly StackUnit[],
    registries: DefinitionRegistries,
    collector: DiagnosticCollector,
    validator: DefinitionValidator,
    target: JavaDataTarget
): void => {
    const loadablePacks = packsWithLoadableManifest(units);
    const lastProvider = lastProviderOfPath(units, loadablePacks);

    for (const unit of units) {
        if (unit.kind === 'datapack') {
            loadDatapack(unit.path, registries, validator, collector, target);
            continue;
        }

        for (const diagnostic of unit.diagnostics) collector.add(diagnostic);

        for (const pack of unit.packs) {
            const header = loadManifest(pack.origin, pack.files.get('manifest.json'), collector);
            if (header === undefined) continue;

            for (const [path, bytes] of pack.files) {
                const provider = lastProvider.get(path);
                const superseded = provider !== undefined && provider !== pack;
                const registry = routeForPath(path);
                // Path-addressed registries use the file path as their identifier, so an
                // earlier copy can be skipped once a later loadable pack provides that path.
                if (superseded && registry !== undefined && isPathAddressedRegistry(registry)) continue;
                loadDefinitionFile(registries, header, path, bytes, superseded, validator, collector);
            }
        }
    }
};

/** Loads one stack without applying strict mode, so cached prefixes can be checked with their suffix. */
const loadUncached = (stack: PackStack, validator: DefinitionValidator, target: JavaDataTarget): LoadResult => {
    const collector = new DiagnosticCollector();
    const definitions = emptyRegistries();
    composeUnits(expandStack(stack), definitions, collector, validator, target);
    return { definitions, diagnostics: collector.diagnostics };
};

const loadCachedPrefix = (
    stack: PackStack,
    validator: DefinitionValidator,
    cache: PrefixCacheOptions,
    target: JavaDataTarget
): LoadResult => {
    if (!Number.isSafeInteger(cache.prefixLength) || cache.prefixLength < 1 || cache.prefixLength > stack.length) {
        throw new PacksErrors.CachePrefixOutOfRange({ prefixLength: cache.prefixLength });
    }

    const prefix = stack.slice(0, cache.prefixLength);
    const suffixUnits = expandStack(stack.slice(cache.prefixLength));
    const suffixLoadablePacks = packsWithLoadableManifest(suffixUnits);
    const suffixPaths = lastProviderOfPath(suffixUnits, suffixLoadablePacks);
    const key = prefixCacheKeyFor(stack, cache, undefined, target);
    const cached = readPrefixCache(cache.filePath, key);
    let prefixResult: LoadResult;

    if (cached.status === 'hit') {
        prefixResult = cached.result;
    } else {
        if (cached.status === 'corrupt') {
            console.warn(
                `[packs] ignoring corrupt composed prefix cache at ${cache.filePath}: ${
                    cached.error instanceof Error ? cached.error.message : String(cached.error)
                }; rebuilding from source`
            );
        }

        prefixResult = loadUncached(prefix, validator, target);
        try {
            writePrefixCache(cache.filePath, key, prefixResult);
        } catch (error) {
            console.warn(
                `[packs] could not write composed prefix cache at ${cache.filePath}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    const collector = new DiagnosticCollector();
    // The prefix was validated without its suffix; reapply the loader's
    // same-path override rule before strict mode sees its definition errors.
    for (const diagnostic of prefixResult.diagnostics) {
        const path = diagnostic.path;
        const registry = path === undefined ? undefined : routeForPath(path);
        const superseded = diagnostic.code.startsWith('definition.') && path !== undefined && suffixPaths.has(path);
        if (superseded && registry !== undefined && isPathAddressedRegistry(registry)) continue;
        collector.add(
            superseded
                ? {
                      ...diagnostic,
                      severity: diagnostic.severity === 'error' ? 'warning' : diagnostic.severity,
                      message: `${diagnostic.message}; a later pack supersedes this file`
                  }
                : diagnostic
        );
    }

    const definitions: DefinitionRegistries = {
        blocks: new Map(prefixResult.definitions.blocks),
        items: new Map(prefixResult.definitions.items),
        entities: new Map(prefixResult.definitions.entities),
        lootTables: new Map(prefixResult.definitions.lootTables),
        tradeTables: new Map(prefixResult.definitions.tradeTables),
        spawnRules: new Map(prefixResult.definitions.spawnRules),
        recipes: new Map(prefixResult.definitions.recipes),
        biomes: new Map(prefixResult.definitions.biomes),
        features: new Map(prefixResult.definitions.features),
        featureRules: new Map(prefixResult.definitions.featureRules),
        itemCatalog: new Map(prefixResult.definitions.itemCatalog),
        blockTransformers: new Map(prefixResult.definitions.blockTransformers),
        lootTablesJava: new Map(prefixResult.definitions.lootTablesJava),
        recipesJava: new Map(prefixResult.definitions.recipesJava),
        advancements: new Map(prefixResult.definitions.advancements),
        tags: new Map(prefixResult.definitions.tags),
        enchantments: new Map(prefixResult.definitions.enchantments),
        damageTypes: new Map(prefixResult.definitions.damageTypes),
        predicates: new Map(prefixResult.definitions.predicates),
        itemModifiers: new Map(prefixResult.definitions.itemModifiers),
        slotSources: new Map(prefixResult.definitions.slotSources),
        functions: new Map(prefixResult.definitions.functions),
        dimensionTypes: new Map(prefixResult.definitions.dimensionTypes),
        paintingVariants: new Map(prefixResult.definitions.paintingVariants),
        enchantmentProviders: new Map(prefixResult.definitions.enchantmentProviders),
        bannerPatterns: new Map(prefixResult.definitions.bannerPatterns),
        instruments: new Map(prefixResult.definitions.instruments),
        jukeboxSongs: new Map(prefixResult.definitions.jukeboxSongs),
        trimPatterns: new Map(prefixResult.definitions.trimPatterns),
        trimMaterials: new Map(prefixResult.definitions.trimMaterials),
        decoratedPotPatterns: new Map(prefixResult.definitions.decoratedPotPatterns),
        catVariants: new Map(prefixResult.definitions.catVariants),
        catSoundVariants: new Map(prefixResult.definitions.catSoundVariants),
        chickenVariants: new Map(prefixResult.definitions.chickenVariants),
        chickenSoundVariants: new Map(prefixResult.definitions.chickenSoundVariants),
        cowVariants: new Map(prefixResult.definitions.cowVariants),
        cowSoundVariants: new Map(prefixResult.definitions.cowSoundVariants),
        frogVariants: new Map(prefixResult.definitions.frogVariants),
        pigVariants: new Map(prefixResult.definitions.pigVariants),
        pigSoundVariants: new Map(prefixResult.definitions.pigSoundVariants),
        wolfVariants: new Map(prefixResult.definitions.wolfVariants),
        wolfSoundVariants: new Map(prefixResult.definitions.wolfSoundVariants),
        zombieNautilusVariants: new Map(prefixResult.definitions.zombieNautilusVariants),
        sulfurCubeArchetypes: new Map(prefixResult.definitions.sulfurCubeArchetypes),
        villagerTrades: new Map(prefixResult.definitions.villagerTrades),
        tradeSets: new Map(prefixResult.definitions.tradeSets),
        trialSpawners: new Map(prefixResult.definitions.trialSpawners),
        timelines: new Map(prefixResult.definitions.timelines),
        worldClocks: new Map(prefixResult.definitions.worldClocks),
        dispenseBehaviors: new Map(prefixResult.definitions.dispenseBehaviors),
        blockSoundSets: new Map(prefixResult.definitions.blockSoundSets),
        dimensions: new Map(prefixResult.definitions.dimensions),
        worldgen: new Map(prefixResult.definitions.worldgen)
    };
    for (const path of suffixPaths.keys()) {
        const registry = routeForPath(path);
        if (registry === undefined || !isPathAddressedRegistry(registry)) continue;
        // The uncached loader skips the prefix copy even if the later file is invalid;
        // remove it here so a bad suffix cannot leave a stale definition behind.
        for (const [identifier, definition] of definitions[registry]) {
            if (definition.path === path) definitions[registry].delete(identifier);
        }
    }
    composeUnits(suffixUnits, definitions, collector, validator, target);
    return { definitions, diagnostics: collector.diagnostics };
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
    const target = options.java ?? DEFAULT_JAVA_DATA_TARGET;
    const result =
        options.cache === undefined
            ? loadUncached(stack, validator, target)
            : loadCachedPrefix(stack, validator, options.cache, target);
    const failed = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (options.strict && failed) throw new PackLoadError(result.diagnostics);

    return result;
};

/** What a definition takes from its pack's manifest. */
interface PackHeader {
    readonly name: string;
    readonly minEngineVersion: FormatVersion | undefined;
}

/** Parses and validates a pack's manifest; returns its header, or undefined to skip the pack. */
const loadManifest = (
    origin: string,
    bytes: Uint8Array | undefined,
    collector: DiagnosticCollector
): PackHeader | undefined => {
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
    return manifest === undefined
        ? undefined
        : { name: manifest.header.name, minEngineVersion: manifest.header.minEngineVersion };
};

/**
 * Parses, validates and registers one definition file; the latest pack wins
 * by identifier. A file a later pack supersedes reports its parse failures as
 * warnings, because its content never reaches the composed result.
 */
const loadDefinitionFile = (
    registries: DefinitionRegistries,
    { name: pack, minEngineVersion }: PackHeader,
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

    registries[registry].set(identifier, {
        identifier,
        registry,
        pack,
        path,
        formatVersion,
        ...(minEngineVersion === undefined ? {} : { minEngineVersion }),
        data
    });
};
