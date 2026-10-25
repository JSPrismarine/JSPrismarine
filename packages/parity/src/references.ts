import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

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

const require = createRequire(import.meta.url);

/** The directory a workspace package lives in, found through its own package.json export. */
const packageRoot = (name: string): string => dirname(require.resolve(`${name}/package.json`));

const repoRoot = join(packageRoot('@jsprismarine/parity'), '..', '..');

/** The fetch cache `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` writes into. */
export const FETCH_CACHE = join(repoRoot, 'node_modules/.cache/jsprismarine');

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

/** The first path under `root` that satisfies `holds`, searched one directory level at a time. */
const firstMatching = (root: string, depth: number, holds: (path: string) => boolean): string | undefined => {
    if (!existsSync(root)) return undefined;
    if (depth === 0) return holds(root) ? root : undefined;
    for (const entry of readdirSync(root)) {
        const found = firstMatching(join(root, entry), depth - 1, holds);
        if (found) return found;
    }
    return undefined;
};

/** Every reference source the parity comparisons read, with how this checkout gets it. */
export const REFERENCES = {
    /** The Java 26.3 jar dump: hardness, light, friction and the rest for all 1286 blocks. */
    javaBlockProperties: committed(
        'java-block-properties',
        'packages/bedrock-data/src/jsp/java/block_properties.json',
        'per-state block properties for 1286 Java blocks'
    ),

    /** The Java 26.3 attribute supplier dump: 93 entity types with their sizes and attributes. */
    javaEntityAttributes: committed(
        'java-entity-attributes',
        'packages/bedrock-data/src/jsp/java/entity_attributes.json',
        'attribute suppliers for 93 Java entity types'
    ),

    /** The `ItemRegistryPacket` capture: every item identifier a 1.26.51 server advertises. */
    bedrockItemCapture: committed(
        'bedrock-item-capture',
        'packages/bedrock-data/src/jsp/required_item_list.json',
        'the item list a Bedrock Dedicated Server advertises'
    ),

    /** Mojang's published Bedrock command metadata, generated into this repository's own table. */
    bedrockCommandMetadata: committed(
        'bedrock-command-metadata',
        'packages/commands/src/tables/bedrockCommands.json',
        "Mojang's 84 Bedrock commands with their overloads and enums"
    ),

    /** The Java worldgen registries the oracle dumper copied out of the jar. */
    worldgenRegistries: committed(
        'worldgen-registries',
        'packages/worldgen/vectors/surface-registries.json',
        "Java's density functions, noises, noise settings and biome climates"
    ),

    /** Nine whole overworld columns Java generated for seed 1234, as block runs. */
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

    /** The pinned Java server jar, which carries the vanilla datapack. */
    javaServerJar: {
        id: 'java-server-jar',
        kind: 'fetched',
        holds: "Java's 1447 loot tables and 2042 recipe files",
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
     * The generated reference world of plan section 6 step 4: a whole Java-generated region
     * with its heightmaps and terrain classes. The capture job does not generate one yet, so
     * the reference region every worldgen row can reach is the nine committed columns.
     */
    referenceWorld: {
        id: 'reference-world',
        kind: 'unbuilt',
        holds: 'a Java-generated reference region with heightmaps and terrain classes',
        howToGet: 'the capture job of plan section 6 step 4 does not generate one yet',
        locate: () => undefined
    },

    /**
     * The measured ore and feature count distribution phase 4 exits against. Nothing in the
     * repository counts ores or features over a sampled region, in either edition.
     */
    featureDistribution: {
        id: 'feature-distribution',
        kind: 'unbuilt',
        holds: 'ore and feature counts per chunk with the spread Java produces',
        howToGet: 'no capture job samples Java feature placement yet',
        locate: () => undefined
    }
} as const satisfies Record<string, ReferenceSource>;

/** The sources a comparison needs that this checkout does not have. */
export const missingReferences = (required: readonly ReferenceSource[]): readonly ReferenceSource[] =>
    required.filter((source) => source.locate() === undefined);

/** The one-line reason a row is not measured, naming each missing source and how to get it. */
export const notMeasuredReason = (missing: readonly ReferenceSource[]): string =>
    missing.map((source) => `no ${source.id} (${source.howToGet})`).join('; ');
