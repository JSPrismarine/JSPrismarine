/**
 * Where the data-driven generator reads Java Edition's world generation registries.
 *
 * `@jsprismarine/packs` routes the recipe, loot and advancement registries but not the
 * `worldgen/*` ones, so the world subsystem reads them itself. Two fetched sources cover
 * everything the terrain stack needs:
 *
 * - the Java vanilla datapack, for `density_function`, `noise`, `noise_settings`,
 *   `material_rule`, `material_condition`, `carver`, `biome`, `feature`, `placed_feature`,
 *   `processor_list`, `structure`, `structure_set`, `template_pool` and the block and biome tags;
 * - Mojang's data generator reports, for `biome_parameters`, the 7594 climate boxes the
 *   overworld's multi-noise biome source is built from. They are Java code rather than data,
 *   so the datapack's `multi_noise_biome_source_parameter_list` document names a preset and
 *   carries no points.
 *
 * Both are extracted game data and therefore untrusted. Every file is read with `JSON.parse`
 * and nothing in them is executed or resolved against the file system.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Points the loader at a local copy of one fetched source. */
export const JAVA_WORLDGEN_ENV = {
    /** A Java vanilla datapack directory, as the Java data generator writes one. */
    datapack: 'JSP_VANILLA_DATAPACK',
    /** A Java data generator output directory, the one holding `reports/`. */
    reports: 'JSP_JAVA_REPORTS'
} as const;

/** The two directories the registries are read out of. */
export interface JavaWorldgenSources {
    /** The datapack root, the directory holding `data/`. */
    readonly datapack: string;
    /** The data generator output root, the directory holding `reports/`. */
    readonly reports: string;
}

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
    /** `tags/block`, each value the raw document with its `values` list and `#` references. */
    readonly blockTags: JavaRegistry;
    /** `tags/worldgen/biome`, which is how a structure says where it may generate. */
    readonly biomeTags: JavaRegistry;
    /** `reports/biome_parameters`, keyed by dimension identifier such as `minecraft:overworld`. */
    readonly biomeParameters: JavaRegistry;
}

/** The nearest existing `node_modules/.cache/jsprismarine` at or above the working directory. */
export const cacheRoot = (): string => {
    let directory = process.cwd();
    for (;;) {
        const candidate = join(directory, 'node_modules', '.cache', 'jsprismarine');
        if (existsSync(candidate)) return candidate;

        const parent = dirname(directory);
        if (parent === directory) return join(process.cwd(), 'node_modules', '.cache', 'jsprismarine');
        directory = parent;
    }
};

/** The one version directory under a cache folder, or undefined when there is none. */
const onlyVersionIn = (root: string, holds: string): string | undefined => {
    if (!existsSync(root)) return undefined;

    for (const entry of readdirSync(root).sort().reverse()) {
        const candidate = join(root, entry);
        if (existsSync(join(candidate, holds))) return candidate;
    }

    return undefined;
};

/**
 * An environment override wins outright, including when it points at nothing: a path somebody
 * typed is a statement of intent, and falling back to the cache would generate a world from
 * data the server was told not to use.
 */
const sourcePath = (override: string | undefined, found: () => string | undefined): string | undefined => {
    if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;
    return found();
};

/**
 * Finds the datapack and the data generator reports.
 *
 * @returns Both directories, or undefined when either is missing. The generator needs both,
 *   and half the data produces a world that is quietly not Java's.
 */
export const findJavaWorldgenSources = (): JavaWorldgenSources | undefined => {
    const root = cacheRoot();
    const datapack = sourcePath(process.env[JAVA_WORLDGEN_ENV.datapack], () =>
        onlyVersionIn(join(root, 'vanilla-datapack'), 'data')
    );
    const reports = sourcePath(process.env[JAVA_WORLDGEN_ENV.reports], () =>
        onlyVersionIn(join(root, 'java-reports'), join('generated', 'reports'))
    );

    if (datapack === undefined || reports === undefined) return undefined;

    // The data generator writes its output under `generated/`; an override may point at either.
    const reportsRoot = existsSync(join(reports, 'reports')) ? reports : join(reports, 'generated');
    return existsSync(join(reportsRoot, 'reports')) ? { datapack, reports: reportsRoot } : undefined;
};

/** Every `.json` file under a directory, as `<prefix>:<path without the extension>`. */
const readRegistry = (root: string, namespace: string): Map<string, unknown> => {
    const documents = new Map<string, unknown>();
    if (!existsSync(root)) return documents;

    const walk = (directory: string, prefix: string): void => {
        for (const entry of readdirSync(directory).sort()) {
            const absolute = join(directory, entry);
            if (statSync(absolute).isDirectory()) {
                walk(absolute, `${prefix}${entry}/`);
                continue;
            }

            if (!entry.endsWith('.json')) continue;
            // Extracted game data: parsed, never executed.
            documents.set(
                `${namespace}:${prefix}${entry.slice(0, -'.json'.length)}`,
                JSON.parse(readFileSync(absolute, 'utf8'))
            );
        }
    };

    walk(root, '');
    return documents;
};

/** The same registry read out of every namespace the datapack carries. */
const readAcrossNamespaces = (dataRoot: string, ...segments: readonly string[]): Map<string, unknown> => {
    const documents = new Map<string, unknown>();
    if (!existsSync(dataRoot)) return documents;

    for (const namespace of readdirSync(dataRoot).sort()) {
        const root = join(dataRoot, namespace, ...segments);
        if (!statSync(join(dataRoot, namespace)).isDirectory()) continue;

        for (const [id, document] of readRegistry(root, namespace)) documents.set(id, document);
    }

    return documents;
};

/**
 * Reads every registry the generator needs.
 *
 * The whole vanilla set is about 1500 files and takes a second or so, so a generator builds
 * this once and shares it across every chunk and every world.
 */
export const loadJavaWorldgenRegistries = (sources: JavaWorldgenSources): JavaWorldgenRegistries => {
    const data = join(sources.datapack, 'data');
    const worldgen = (registry: string) => readAcrossNamespaces(data, 'worldgen', registry);

    return {
        densityFunctions: worldgen('density_function'),
        noises: worldgen('noise'),
        noiseSettings: worldgen('noise_settings'),
        materialRules: worldgen('material_rule'),
        materialConditions: worldgen('material_condition'),
        carvers: worldgen('carver'),
        biomes: worldgen('biome'),
        features: worldgen('feature'),
        placedFeatures: worldgen('placed_feature'),
        blockStateProviders: worldgen('block_state_provider'),
        processorLists: worldgen('processor_list'),
        structures: worldgen('structure'),
        structureSets: worldgen('structure_set'),
        templatePools: worldgen('template_pool'),
        blockTags: readAcrossNamespaces(data, 'tags', 'block'),
        biomeTags: readAcrossNamespaces(data, 'tags', 'worldgen', 'biome'),
        biomeParameters: normalizeBiomeParameters(
            readRegistry(join(sources.reports, 'reports', 'biome_parameters', 'minecraft'), 'minecraft')
        )
    };
};

/**
 * Rewrites a climate axis the data generator wrote as `[min, max]` into the `{min, max}` object
 * `@jsprismarine/worldgen` reads.
 *
 * Java's codec accepts both, and the two sources disagree: a
 * `multi_noise_biome_source_parameter_list` document written by hand uses the object, and
 * `BiomeParametersDumpReport` writes the list. Normalizing here keeps the shape difference at
 * the one place that knows the report exists.
 */
const normalizeBiomeParameters = (documents: Map<string, unknown>): Map<string, unknown> => {
    const axis = (value: unknown): unknown =>
        Array.isArray(value) && value.length === 2 ? { min: value[0], max: value[1] } : value;

    const normalized = new Map<string, unknown>();
    for (const [id, document] of documents) {
        // Extracted game data: every field is checked rather than trusted.
        const biomes = (document as { biomes?: unknown })?.biomes;
        if (!Array.isArray(biomes)) {
            normalized.set(id, document);
            continue;
        }

        normalized.set(id, {
            biomes: biomes.map((entry) => {
                const parameters = (entry as { parameters?: unknown })?.parameters;
                if (typeof parameters !== 'object' || parameters === null) return entry;

                return {
                    ...(entry as object),
                    parameters: Object.fromEntries(
                        Object.entries(parameters).map(([name, value]) => [name, axis(value)])
                    )
                };
            })
        });
    }

    return normalized;
};
