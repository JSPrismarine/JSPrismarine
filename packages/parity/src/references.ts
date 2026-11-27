import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The generator's own loader decides where the datapack and the data generator reports are,
// including the two environment overrides it documents. Asking it is the only way a row that
// depends on that data agrees with the generator about whether this checkout has it. The
// module imports nothing but `node:fs` and `node:path`, so `scripts/capture-corpus.ts` can
// load it under plain node; the loader itself sits in `javaWorldgenData.ts` and pulls in
// `@jsprismarine/packs`, which strip-only mode cannot parse.
import { findJavaWorldgenSources } from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenSources';
// The datagen manifest decides which protocol version's block palette the unversioned exports
// are generated from. Asking it is what keeps this reference on the same capture `registry.blocks`
// and the block schemas read. The module reads one JSON file and imports nothing else.
import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';
import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';

import { scenarioGoldenPath } from './scripting/record.ts';
import { SCRIPT_SCENARIOS } from './scripting/scenarios.ts';
import type { ScriptingFamily } from './scripting/scenarios.ts';

/**
 * Where each comparison's reference data comes from, and whether this checkout has it.
 *
 * A parity row is only worth a green tick when something real stood on the other side of the
 * comparison. Three kinds of source appear here. Committed goldens ship in the repository and
 * are always present. Fetched sources live in `node_modules/.cache/jsprismarine/`, which
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates and a clean checkout
 * does not have. Unbuilt sources do not exist anywhere yet; their rows report "no reference
 * data" until the capture job that produces them lands.
 *
 * `describeFamily` in `measure.ts` turns a missing source into a skipped test, which the
 * dashboard renders as "not measured" rather than counting toward a green row.
 */

// This file is `packages/parity/src/references.ts`, so the repository root is three up. The
// path is walked rather than resolved through the package name, because a package cannot
// resolve itself by name and `scripts/dashboard.ts` runs outside the bundler.
const repoRoot = join(import.meta.dirname, '..', '..', '..');

/** The fetch cache `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` writes into. */
export const FETCH_CACHE = join(repoRoot, 'node_modules/.cache/jsprismarine');

/**
 * The Bedrock captures live under a directory per protocol version. `sources.json` names the
 * one the package builds its unversioned exports from, which is the one these rows measure.
 */
const bedrockCaptureDir = (): string => {
    const file = join(repoRoot, 'packages/bedrock-data/sources.json');
    // Parsed JSON has no type the compiler can see; this is the one field read here.
    const sources = JSON.parse(readFileSync(file, 'utf8')) as { bds: { defaultProtocolVersion: number } };
    return `packages/bedrock-data/src/jsp/v${sources.bds.defaultProtocolVersion}`;
};

/** Where `dump:bedrock` writes the reference world golden, relative to the repository root. */
export const REFERENCE_WORLD_PATH = `${bedrockCaptureDir()}/reference_world.json`;

/** Where `capture:corpus` writes the generation corpus golden, relative to the repository root. */
export const GENERATION_CORPUS_PATH = 'packages/parity/goldens/worldgen-corpus.json';

/**
 * The Java Edition version the pinned datapack and data generator reports come from.
 *
 * The generation corpus is a recording of what the server produced against one version of that
 * data, so a bump makes the recording stale. The corpus rows read this and say so.
 */
export const pinnedJavaDataVersion = (): string | undefined => pinnedJavaVersion();

/** How a reference source reaches this checkout. */
export type ReferenceKind =
    /** Committed to the repository, so every checkout has it. */
    | 'committed'
    /** Downloaded into the fetch cache, absent from a clean checkout. */
    | 'fetched'
    /** Nothing produces it yet, so no checkout has it. */
    | 'unbuilt';

/** One body of reference data a comparison stands on. */
export interface ReferenceSource {
    /** A short id, used in the "not measured" message the dashboard shows. */
    readonly id: string;
    readonly kind: ReferenceKind;
    /** What the source holds, in one line. */
    readonly holds: string;
    /** What has to happen for a missing source to appear, or why nothing produces it yet. */
    readonly howToGet: string;
    /** The absolute path to the source, or undefined when this checkout does not have it. */
    locate(): string | undefined;
}

/** A source that ships in the repository, named relative to the repository root. */
const committed = (id: string, path: string, holds: string): ReferenceSource => ({
    id,
    kind: 'committed',
    holds,
    howToGet: `${path} is committed; a missing file means the checkout is incomplete`,
    locate: () => {
        const absolute = join(repoRoot, path);
        return existsSync(absolute) ? absolute : undefined;
    }
});

/** The pins in `sources.json` the reference locators read, or `undefined` without the file. */
const pinnedSources = ():
    | {
          javaServer?: { defaultVersion?: string; versions?: Record<string, { preview?: boolean }> };
          bedrockSamples?: { tag?: string };
      }
    | undefined => {
    const manifest = join(repoRoot, 'packages/bedrock-data/sources.json');
    if (!existsSync(manifest)) return undefined;
    // sources.json is parsed JSON; only the Java releases and the bedrock-samples tag are read.
    return JSON.parse(readFileSync(manifest, 'utf-8')) as {
        javaServer?: { defaultVersion?: string; versions?: Record<string, { preview?: boolean }> };
        bedrockSamples?: { tag?: string };
    };
};

/** The default Java Edition release, read from the one manifest that declares it. */
const pinnedJavaVersion = (): string | undefined => pinnedSources()?.javaServer?.defaultVersion;

/**
 * The Java Edition preview `sources.json` pins beside the default release, such as a pre-release
 * of the next one, or undefined when it pins none.
 */
export const previewJavaVersion = (): string | undefined =>
    Object.entries(pinnedSources()?.javaServer?.versions ?? {}).find(([, entry]) => entry.preview === true)?.[0];

/** A release's server jar in the fetch cache, or undefined when the cache does not hold it. */
const cachedJavaServerJar = (version: string | undefined): string | undefined => {
    if (version === undefined) return undefined;
    for (const source of ['java', 'java-server']) {
        const jar = join(FETCH_CACHE, source, version, 'server.jar');
        if (existsSync(jar)) return jar;
    }
    return undefined;
};

/**
 * The pinned `bedrock-samples` checkout's directories, two levels under its tag. The fetch cache
 * keeps older tags beside it, and their item ids can differ from the pinned data.
 */
const pinnedBedrockSamples = (holds: (path: string) => boolean): string | undefined => {
    const tag = pinnedSources()?.bedrockSamples?.tag;
    return tag === undefined ? undefined : firstMatching(join(FETCH_CACHE, 'bedrock-samples', tag), 2, holds);
};

/**
 * The first directory under `root` at exactly `depth` levels down that satisfies `holds`.
 *
 * The fetch cache nests a source under its version and then under the archive's own top-level
 * folder, whose name carries a commit hash, so the path cannot be written out.
 */
const firstMatching = (root: string, depth: number, holds: (path: string) => boolean): string | undefined => {
    if (!existsSync(root)) return undefined;
    if (depth === 0) return holds(root) ? root : undefined;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const found = firstMatching(join(root, entry.name), depth - 1, holds);
        if (found) return found;
    }
    return undefined;
};

/** Every reference source the parity comparisons read, with how this checkout gets it. */
export const REFERENCES = {
    /** The Java 26.3 block registry, keyed by every block in the generated mapping table. */
    javaBlockRegistry: committed(
        'java-block-registry',
        `packages/mapping/src/tables/${javaServerCacheFolder}/blocks.json`,
        'Java block identifiers and their state mapping'
    ),

    /** The Java 26.3 item registry, keyed by every item in the generated mapping table. */
    javaItemRegistry: committed(
        'java-item-registry',
        `packages/mapping/src/tables/${javaServerCacheFolder}/items.json`,
        'Java item identifiers and their Bedrock mapping'
    ),

    /** The Java 26.3 entity registry, keyed by every entity in the generated mapping table. */
    javaEntityRegistry: committed(
        'java-entity-registry',
        `packages/mapping/src/tables/${javaServerCacheFolder}/entities.json`,
        'Java entity identifiers and their Bedrock mapping'
    ),

    /** The committed Bedrock Dedicated Server block palette snapshot and its property domains. */
    bedrockBlockPalette: {
        id: 'bedrock-block-palette',
        kind: 'committed',
        holds: 'the block states and property domains captured from the Bedrock Dedicated Server',
        howToGet:
            'the snapshot selected by the datagen manifest is committed; a missing file means the checkout is incomplete',
        locate: () => {
            const snapshot = blockPaletteSnapshotPath();
            return existsSync(snapshot) ? snapshot : undefined;
        }
    },
    /** The default Java release's jar dump: per-state hardness, light, friction and related properties. */
    javaBlockProperties: committed(
        'java-block-properties',
        `packages/bedrock-data/src/jsp/java/${javaServerCacheFolder}/block_properties.json`,
        'per-state properties for Java blocks'
    ),

    /** The default Java release's attribute supplier dump: entity sizes and attributes. */
    javaEntityAttributes: committed(
        'java-entity-attributes',
        `packages/bedrock-data/src/jsp/java/${javaServerCacheFolder}/entity_attributes.json`,
        'attribute suppliers for Java entity types'
    ),

    /** The `ItemRegistryPacket` capture: every item identifier a 1.26.51 server advertises. */
    bedrockItemCapture: committed(
        'bedrock-item-capture',
        `${bedrockCaptureDir()}/required_item_list.json`,
        'the item list a Bedrock Dedicated Server advertises'
    ),

    /** The `AvailableActorIdentifiersPacket` golden: every actor type a 1.26.51 server advertises. */
    bedrockActorIdentifiers: committed(
        'bedrock-actor-identifiers',
        `${bedrockCaptureDir()}/wire/0x77.bin`,
        'the actor types a Bedrock Dedicated Server advertises'
    ),

    /** The `BiomeDefinitionListPacket` capture: the biomes a 1.26.51 client is told about. */
    bedrockBiomeDefinitions: committed(
        'bedrock-biome-definitions',
        `${bedrockCaptureDir()}/biome_definitions_network.nbt`,
        'the biome list a Bedrock Dedicated Server sends a joining client'
    ),

    /** The Java 26.3 identifier census: every identifier of a registry no Bedrock table answers. */
    javaIdentifierCensus: committed(
        'java-identifier-census',
        `packages/mapping/src/tables/${javaServerCacheFolder}/javaIdentifiers.json`,
        "Java 26.3's identifiers for the registries no Bedrock mapping table answers"
    ),

    /** Mojang's published Bedrock command metadata, generated into this repository's own table. */
    bedrockCommandMetadata: committed(
        'bedrock-command-metadata',
        'packages/commands/src/tables/bedrockCommands.json',
        "Mojang's Bedrock commands with their overloads and enums"
    ),

    /** The `AvailableCommandsPacket` a Bedrock Dedicated Server sends a joining client. */
    bedrockAvailableCommands: committed(
        'bedrock-available-commands',
        `${bedrockCaptureDir()}/wire/0x4c.bin`,
        'the command list a Bedrock Dedicated Server sends a joining client'
    ),

    /** How a 1.26.51 server's console answers each probe line of the `commands` capture pass. */
    bedrockCommandAnswers: committed(
        'bedrock-command-answers',
        `${bedrockCaptureDir()}/command_answers.json`,
        "the Bedrock Dedicated Server console's answer to each probe command line"
    ),

    /** The Java worldgen registries the oracle dumper copied out of the jar. */
    worldgenRegistries: committed(
        'worldgen-registries',
        `packages/worldgen/vectors/${javaServerCacheFolder}/surface-registries.json`,
        "Java's density functions, noises, noise settings and biome climates"
    ),

    /** Whole overworld columns Java generated for seed 1234, as block runs. */
    worldgenColumns: committed(
        'worldgen-columns',
        `packages/worldgen/vectors/${javaServerCacheFolder}/chunk.json`,
        'nine Java overworld columns at seed 1234, aquifers applied'
    ),

    /** `final_density` over whole chunks from both of Java's density paths, hashed per section. */
    worldgenDensityVolumes: committed(
        'worldgen-density-volumes',
        `packages/worldgen/vectors/${javaServerCacheFolder}/density-volume.json`,
        "final_density over 14 whole chunks from Java's sampleVolume and sampleValue paths"
    ),

    /** Java's climate parameter lists with the biome each sample point resolves to. */
    worldgenBiomePoints: committed(
        'worldgen-biome-points',
        `packages/worldgen/vectors/${javaServerCacheFolder}/biome-points.json`,
        "Java's multi-noise biome lookups for the overworld and the end"
    ),

    /** The overworld cells whose nearest climate box is tied, with Java's answer after each history. */
    worldgenClimateTies: committed(
        'worldgen-climate-ties',
        `packages/worldgen/vectors/${javaServerCacheFolder}/climate-ties.json`,
        "Java's multi-noise lookups at exact ties, with and without an earlier lookup"
    ),

    /** The biome Java reads a source chunk's carvers from, beside the jittered biome at its corner. */
    worldgenCarverBiomes: committed(
        'worldgen-carver-biomes',
        `packages/worldgen/vectors/${javaServerCacheFolder}/carver-biomes.json`,
        "Java's carver-selection noise biome for a 48 by 48 window of overworld chunks"
    ),

    /** Java NoiseSpawnFinder's selected Overworld origin positions across representative seeds. */
    worldgenSpawnPositions: committed(
        'worldgen-spawn-positions',
        `packages/worldgen/vectors/${javaServerCacheFolder}/spawn.json`,
        "Java's climate-selected spawn positions and containing chunks"
    ),

    /**
     * The generation corpus: what this server's chunk generator produced at a named commit.
     *
     * The only reference here the server itself wrote, so it measures change rather than
     * parity with Java. `packages/parity/README.md` under "The generation corpus" says what
     * that row does and does not claim.
     */
    generationCorpus: committed(
        'generation-corpus',
        GENERATION_CORPUS_PATH,
        "digests, whole chunks, a block census and the structure placements of this server's own generator"
    ),

    /**
     * Java's world generation registries: the vanilla datapack and the data generator reports.
     *
     * Together they are what the data-driven generator reads, so a row that regenerates a chunk
     * needs both. The generator's own loader finds them, including its two path overrides.
     */
    javaWorldgenData: {
        id: 'java-worldgen-data',
        kind: 'fetched',
        holds: "Java's density functions, biomes, features, structures and climate boxes",
        howToGet:
            'run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and ' +
            '`pnpm --filter @jsprismarine/bedrock-data run datagen:java`',
        locate: () => findJavaWorldgenSources()?.datapack
    },

    /** The pinned Java server jar, which carries the vanilla datapack. */
    javaServerJar: {
        id: 'java-server-jar',
        kind: 'fetched',
        holds: "Java's loot tables and recipe files",
        howToGet: 'run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`',
        locate: () => cachedJavaServerJar(pinnedJavaVersion())
    },

    /** The server jar of the Java preview `sources.json` pins, which a Java bring-up fetches. */
    javaPreviewServerJar: {
        id: 'java-preview-server-jar',
        kind: 'fetched',
        holds: 'the code of the Java preview the next release is brought up against',
        howToGet:
            'run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java <preview>` with the preview ' +
            '`sources.json` pins',
        locate: () => cachedJavaServerJar(previewJavaVersion())
    },

    /** The vanilla Bedrock behavior pack, which carries the 129 entity definitions and the biome files. */
    bedrockBehaviorPack: {
        id: 'bedrock-behavior-pack',
        kind: 'fetched',
        holds: "Mojang's 129 vanilla entity definitions and the vanilla biome files",
        howToGet: 'run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`',
        locate: () => pinnedBedrockSamples((path) => existsSync(join(path, 'behavior_pack', 'entities')))
    },

    /** Mojang's vanilla data modules in `bedrock-samples`, which list every item with its numeric id. */
    bedrockVanillaData: {
        id: 'bedrock-vanilla-data',
        kind: 'fetched',
        holds: "Mojang's vanilla item list with each item's numeric id",
        howToGet: 'run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`',
        locate: () =>
            pinnedBedrockSamples((path) =>
                existsSync(join(path, 'metadata', 'vanilladata_modules', 'mojang-items.json'))
            )
    },

    /**
     * The generated reference world of plan section 6 step 4, as `dump:bedrock` reduces it: a
     * digest of the heightmap, biome arrays, surface and block states per chunk of a 400 chunk
     * region, sixteen chunks kept whole, and one block histogram over the whole region. The
     * histogram is what an ore and feature count row compares against, so this one source
     * carries both halves of what phase 4 needs.
     *
     * No run has committed the golden. Mojang publishes the Bedrock Dedicated Server as a Linux
     * x86-64 binary and the capture job runs it, so the golden comes from CI rather than from a
     * developer's machine. Until it lands, the reference the worldgen rows reach is the nine
     * Java columns the oracle dumped.
     *
     * `packages/bedrock-data/README.md` under "The reference world" and
     * `docs/data-driven/data-pipeline.md` document what the job writes;
     * `loadReferenceWorld` in `goldens.ts` reads it and checks the format version.
     */
    referenceWorld: {
        id: 'reference-world',
        kind: 'unbuilt',
        holds: 'per-chunk digests, whole sample chunks and a region block histogram for 400 generated chunks',
        howToGet: 'no run of `pnpm --filter @jsprismarine/bedrock-data run dump:bedrock` has committed its golden',
        locate: () => {
            const golden = join(repoRoot, REFERENCE_WORLD_PATH);
            return existsSync(golden) ? golden : undefined;
        }
    }
} as const satisfies Record<string, ReferenceSource>;

/**
 * The BDS goldens of one scripting family's scenarios.
 *
 * Present once any scenario of the family has a captured golden. A family with no scenario yet
 * reports "not measured" rather than passing on nothing; a declared scenario whose golden is
 * missing fails its own row instead.
 */
export const scriptingGoldens = (family: ScriptingFamily): ReferenceSource => ({
    id: `${family}-goldens`,
    kind: 'committed',
    holds: `what the pinned Bedrock Dedicated Server's scripts recorded for each ${family} scenario`,
    howToGet: 'add a scenario to SCRIPT_SCENARIOS and run `pnpm --filter @jsprismarine/parity run capture:scripting`',
    locate: () =>
        SCRIPT_SCENARIOS.filter((scenario) => scenario.family === family)
            .map((scenario) => scenarioGoldenPath(scenario.id))
            .find((path) => existsSync(path))
});

/** The sources a comparison needs that this checkout does not have. */
export const missingReferences = (required: readonly ReferenceSource[]): readonly ReferenceSource[] =>
    required.filter((source) => source.locate() === undefined);

/** The one-line reason a row is not measured, naming each missing source and how to get it. */
export const notMeasuredReason = (missing: readonly ReferenceSource[]): string =>
    missing.map((source) => `no ${source.id} (${source.howToGet})`).join('; ');
