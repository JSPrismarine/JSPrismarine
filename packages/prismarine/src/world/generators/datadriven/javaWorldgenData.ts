/**
 * Where the data-driven generator reads Java Edition's world generation registries.
 *
 * Two fetched sources cover everything the terrain stack needs:
 *
 * - the Java vanilla datapack, which `@jsprismarine/packs` loads like any other member of the
 *   pack stack. Its `worldgen/*` directories, `dimension_type`, `dimension` and the block and
 *   biome tags arrive in `Definitions`, and {@link loadJavaWorldgenRegistriesFrom} projects
 *   them into the maps the generator reads. A user datapack later in the stack adds or
 *   overrides a document by the same route;
 * - Mojang's data generator reports, for `biome_parameters`, the 7594 climate boxes the
 *   overworld's multi-noise biome source is built from. They are Java code rather than data,
 *   so the datapack's `multi_noise_biome_source_parameter_list` document names a preset and
 *   carries no points. The reports are not datapack content, so this module reads them itself.
 *
 * Structure templates are `.nbt` files under `data/<namespace>/structure/`, which is not a
 * worldgen directory; `javaStructureTemplates.ts` reads them.
 *
 * Both sources are extracted game data and therefore untrusted. Every report is read with
 * `JSON.parse`, the pack loader parses the datapack the same way, and nothing in either is
 * executed or resolved against the file system.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Definitions, WorldgenRegistryKind } from '@jsprismarine/packs';
import { load } from '@jsprismarine/packs';
import type { JavaWorldgenSources } from './javaWorldgenSources';
import { JAVA_WORLDGEN_ENV, findJavaWorldgenSources } from './javaWorldgenSources';

export { JAVA_WORLDGEN_ENV, cacheRoot, findJavaWorldgenSources, type JavaWorldgenSources } from './javaWorldgenSources';

/** One registry's documents, keyed by namespaced identifier. */
export type JavaRegistry = ReadonlyMap<string, unknown>;

/** Every Java registry the generator reads, parsed no further than JSON. */
export interface JavaWorldgenRegistries {
    readonly densityFunctions: JavaRegistry;
    readonly noises: JavaRegistry;
    readonly noiseSettings: JavaRegistry;
    readonly materialRules: JavaRegistry;
    readonly materialConditions: JavaRegistry;
    readonly carvers: JavaRegistry;
    readonly biomes: JavaRegistry;
    readonly features: JavaRegistry;
    readonly placedFeatures: JavaRegistry;
    readonly blockStateProviders: JavaRegistry;
    /** `worldgen/processor_list`, which a structure template is run through as it is placed. */
    readonly processorLists: JavaRegistry;
    /** `worldgen/structure`, the 52 structures and the fields each type generates from. */
    readonly structures: JavaRegistry;
    /** `worldgen/structure_set`, the 21 placements that decide which chunks a structure starts in. */
    readonly structureSets: JavaRegistry;
    /** `worldgen/template_pool`, the 245 pools a jigsaw structure grows out of. */
    readonly templatePools: JavaRegistry;
    /** `dimension_type`, the physics of a dimension: bounds, light, skybox and clock. */
    readonly dimensionTypes: JavaRegistry;
    /** `dimension`, a level stem a datapack adds outside a world preset. Vanilla ships none. */
    readonly dimensions: JavaRegistry;
    /** `worldgen/world_preset`, the seven presets that carry vanilla's three stems. */
    readonly worldPresets: JavaRegistry;
    /** `worldgen/flat_level_generator_preset`, the layer lists the flat generator offers. */
    readonly flatLevelGeneratorPresets: JavaRegistry;
    /**
     * `worldgen/multi_noise_biome_source_parameter_list`, each naming the preset whose climate
     * boxes sit in `biomeParameters`.
     */
    readonly multiNoiseParameterLists: JavaRegistry;
    /** `tags/block`, each value the raw document with its `values` list and `#` references. */
    readonly blockTags: JavaRegistry;
    /** `tags/worldgen/biome`, which is how a structure says where it may generate. */
    readonly biomeTags: JavaRegistry;
    /** `reports/biome_parameters`, keyed by dimension identifier such as `minecraft:overworld`. */
    readonly biomeParameters: JavaRegistry;
}

/**
 * The documents of one worldgen kind, keyed by namespaced id.
 *
 * The composite `worldgen` registry keys a document `<kind>/<namespace>:<path>`; the generator
 * resolves a reference such as `minecraft:overworld/sloped_cheese` within a kind it already
 * knows, so the kind prefix comes off here.
 */
const worldgenKind = (definitions: Definitions, kind: WorldgenRegistryKind): Map<string, unknown> =>
    withPrefixRemoved(definitions.worldgen, `${kind}/`);

/**
 * The tags of one tagged registry, keyed by namespaced id.
 *
 * The `tags` registry keys a tag `<tagged registry>/<namespace>:<path>`, as `block/minecraft:logs`
 * or `worldgen/biome/minecraft:is_forest`, because one datapack tags many registries.
 */
const taggedRegistry = (definitions: Definitions, tagged: string): Map<string, unknown> =>
    withPrefixRemoved(definitions.tags, `${tagged}/`);

const withPrefixRemoved = (
    definitions: ReadonlyMap<string, { readonly data: unknown }>,
    prefix: string
): Map<string, unknown> => {
    const documents = new Map<string, unknown>();
    for (const [identifier, definition] of definitions) {
        if (identifier.startsWith(prefix)) documents.set(identifier.slice(prefix.length), definition.data);
    }
    return documents;
};

/** The documents of a plain Java registry, whose ids already are the namespaced id. */
const plainRegistry = (definitions: ReadonlyMap<string, { readonly data: unknown }>): Map<string, unknown> =>
    new Map([...definitions].map(([identifier, definition]) => [identifier, definition.data]));

/**
 * Reads `reports/biome_parameters/<namespace>/<dimension>.json` as `<namespace>:<dimension>`.
 *
 * The report is one directory per namespace holding one file per preset, and nothing deeper,
 * so this is the one directory walk left in the world subsystem.
 */
const readBiomeParameterReports = (reports: string): Map<string, unknown> => {
    const documents = new Map<string, unknown>();
    const root = join(reports, 'reports', 'biome_parameters');
    if (!existsSync(root)) return documents;

    for (const namespace of readdirSync(root).sort()) {
        const directory = join(root, namespace);
        if (!statSync(directory).isDirectory()) continue;

        for (const entry of readdirSync(directory).sort()) {
            if (!entry.endsWith('.json')) continue;
            // Extracted game data: parsed, never executed.
            documents.set(
                `${namespace}:${entry.slice(0, -'.json'.length)}`,
                JSON.parse(readFileSync(join(directory, entry), 'utf8'))
            );
        }
    }

    return documents;
};

/**
 * Projects a loaded pack stack into the registries the generator reads.
 *
 * @param definitions - What `@jsprismarine/packs` composed; the vanilla datapack and whatever a
 *   world or plugin stacked on top of it. Only the worldgen, dimension and tag registries are
 *   read.
 * @param reports - The data generator output root, the directory holding `reports/`, for the
 *   biome parameter reports no datapack carries.
 */
export const loadJavaWorldgenRegistriesFrom = (definitions: Definitions, reports: string): JavaWorldgenRegistries => ({
    densityFunctions: worldgenKind(definitions, 'density_function'),
    noises: worldgenKind(definitions, 'noise'),
    noiseSettings: worldgenKind(definitions, 'noise_settings'),
    materialRules: worldgenKind(definitions, 'material_rule'),
    materialConditions: worldgenKind(definitions, 'material_condition'),
    carvers: worldgenKind(definitions, 'carver'),
    biomes: worldgenKind(definitions, 'biome'),
    features: worldgenKind(definitions, 'feature'),
    placedFeatures: worldgenKind(definitions, 'placed_feature'),
    blockStateProviders: worldgenKind(definitions, 'block_state_provider'),
    processorLists: worldgenKind(definitions, 'processor_list'),
    structures: worldgenKind(definitions, 'structure'),
    structureSets: worldgenKind(definitions, 'structure_set'),
    templatePools: worldgenKind(definitions, 'template_pool'),
    dimensionTypes: plainRegistry(definitions.dimensionTypes),
    dimensions: plainRegistry(definitions.dimensions),
    worldPresets: worldgenKind(definitions, 'world_preset'),
    flatLevelGeneratorPresets: worldgenKind(definitions, 'flat_level_generator_preset'),
    multiNoiseParameterLists: worldgenKind(definitions, 'multi_noise_biome_source_parameter_list'),
    blockTags: taggedRegistry(definitions, 'block'),
    biomeTags: taggedRegistry(definitions, 'worldgen/biome'),
    biomeParameters: readBiomeParameterReports(reports)
});

/**
 * Reads every registry the generator needs out of the fetched vanilla data alone.
 *
 * This loads a pack stack of one member, the vanilla datapack, and hands it to
 * {@link loadJavaWorldgenRegistriesFrom}. A server that has composed its real stack through
 * `ServerContent` should project that instead, so a world's own datapacks reach the generator.
 * Loading the vanilla datapack costs about 300 ms, so a generator builds this once and shares
 * it across every chunk and every world.
 */
export const loadJavaWorldgenRegistries = (sources: JavaWorldgenSources): JavaWorldgenRegistries =>
    loadJavaWorldgenRegistriesFrom(load([{ kind: 'datapack', path: sources.datapack }]).definitions, sources.reports);

/**
 * Reads every registry the generator needs, or explains what to fetch.
 *
 * @throws {Error} When the datapack or the reports are not on disk, naming the commands and
 *   the environment variables that put them there.
 */
export const requireJavaWorldgenRegistries = (): JavaWorldgenRegistries => {
    const sources = findJavaWorldgenSources();
    if (sources === undefined) {
        throw new Error(
            'The noise generator needs Java Edition 26.3 world generation data. Run ' +
                '`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and ' +
                '`pnpm --filter @jsprismarine/bedrock-data run datagen:java`, or set ' +
                `${JAVA_WORLDGEN_ENV.datapack} and ${JAVA_WORLDGEN_ENV.reports}.`
        );
    }
    return loadJavaWorldgenRegistries(sources);
};
