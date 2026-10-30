import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The generator's own loader decides where the datapack and the data generator reports are,
// including the two environment overrides it documents. Asking it is the only way a row that
// depends on that data agrees with the generator about whether this checkout has it. The
// module imports nothing but `node:fs` and `node:path`, so `scripts/capture-corpus.ts` can
// load it under plain node; the loader itself sits in `javaWorldgenData.ts` and pulls in
// `@jsprismarine/packs`, which strip-only mode cannot parse.
import { findJavaWorldgenSources } from '@jsprismarine/prismarine/world/generators/datadriven/javaWorldgenSources';
import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';

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

/** The pinned Java Edition version, read from the one manifest that declares it. */
const pinnedJavaVersion = (): string | undefined => {
    const manifest = join(repoRoot, 'packages/bedrock-data/sources.json');
    if (!existsSync(manifest)) return undefined;
    // sources.json is parsed JSON; only the pinned Java version is read.
    const sources = JSON.parse(readFileSync(manifest, 'utf-8')) as { javaServer?: { version?: string } };
    return sources.javaServer?.version;
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
    /** The Java 26.3 jar dump: per-state hardness, light, friction and related properties. */
    javaBlockProperties: committed(
        'java-block-properties',
        'packages/bedrock-data/src/jsp/java/block_properties.json',
        'per-state properties for Java blocks'
    ),

    /** The Java 26.3 attribute supplier dump: entity sizes and attributes. */
    javaEntityAttributes: committed(
        'java-entity-attributes',
        'packages/bedrock-data/src/jsp/java/entity_attributes.json',
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
        'packages/bedrock-data/src/resources/entity_identifiers.dat',
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
        'packages/mapping/src/tables/javaIdentifiers.json',
        "Java 26.3's identifiers for the registries no Bedrock mapping table answers"
    ),

    /** Mojang's published Bedrock command metadata, generated into this repository's own table. */
    bedrockCommandMetadata: committed(
        'bedrock-command-metadata',
        'packages/commands/src/tables/bedrockCommands.json',
        "Mojang's Bedrock commands with their overloads and enums"
    ),

    /** The Java worldgen registries the oracle dumper copied out of the jar. */
    worldgenRegistries: committed(
        'worldgen-registries',
        'packages/worldgen/vectors/surface-registries.json',
        "Java's density functions, noises, noise settings and biome climates"
    ),

    /** Whole overworld columns Java generated for seed 1234, as block runs. */
    worldgenColumns: committed(
        'worldgen-columns',
        'packages/worldgen/vectors/chunk.json',
        'nine Java overworld columns at seed 1234, aquifers applied'
    ),

    /** Java's climate parameter lists with the biome each sample point resolves to. */
    worldgenBiomePoints: committed(
        'worldgen-biome-points',
        'packages/worldgen/vectors/biome-points.json',
        "Java's multi-noise biome lookups for the overworld and the end"
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
        locate: () => {
            const version = pinnedJavaVersion();
            if (version === undefined) return undefined;
            for (const source of ['java', 'java-server']) {
                const jar = join(FETCH_CACHE, source, version, 'server.jar');
                if (existsSync(jar)) return jar;
            }
            return undefined;
        }
    },

    /** The vanilla Bedrock behavior pack, which carries the 129 entity definitions. */
    bedrockBehaviorPack: {
        id: 'bedrock-behavior-pack',
        kind: 'fetched',
        holds: "Mojang's 129 vanilla entity definitions",
        howToGet: 'run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`',
        locate: () =>
            firstMatching(join(FETCH_CACHE, 'bedrock-samples'), 3, (path) =>
                existsSync(join(path, 'behavior_pack', 'entities'))
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

/** The sources a comparison needs that this checkout does not have. */
export const missingReferences = (required: readonly ReferenceSource[]): readonly ReferenceSource[] =>
    required.filter((source) => source.locate() === undefined);

/** The one-line reason a row is not measured, naming each missing source and how to get it. */
export const notMeasuredReason = (missing: readonly ReferenceSource[]): string =>
    missing.map((source) => `no ${source.id} (${source.howToGet})`).join('; ');
