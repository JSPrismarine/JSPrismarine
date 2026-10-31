/**
 * Which chunks a structure may start in, and which structure of a set starts there.
 *
 * `@jsprismarine/structures` owns the three placement types and the four frequency reduction
 * rules; this is the layer above them, where a world seed, the 21 vanilla structure sets and the
 * biomes a dimension actually has decide what a chunk is offered.
 *
 * Two things happen here that the placement types alone cannot do. A set whose every structure
 * names biomes this dimension does not have is dropped outright, which is how the nether's and
 * the end's sets stay out of the overworld without anything naming a dimension. And the chunk
 * scan is done per region rather than per chunk: a random spread placement chooses one chunk per
 * `spacing` by `spacing` region, so asking the region is one draw where asking every chunk in a
 * 17 by 17 window would be 289.
 */
import type { ChunkPosition, RandomSpreadPlacement, StructurePlacement, StructureSet } from '@jsprismarine/structures';
import {
    concentricRingChunks,
    createLegacyRandom,
    isStructureChunk,
    largeFeatureSeed,
    parseStructureSet,
    pickStructure,
    potentialStructureChunk
} from '@jsprismarine/structures';

import type { JavaRegistry } from './javaWorldgenData';

/** One `worldgen/structure_set`, with the identifier it was registered under. */
export interface NamedStructureSet {
    readonly id: string;
    readonly set: StructureSet;
}

/** An inclusive rectangle of chunks. */
export interface ChunkRange {
    readonly minChunkX: number;
    readonly minChunkZ: number;
    readonly maxChunkX: number;
    readonly maxChunkZ: number;
}

/**
 * Reads the structure sets a dimension uses.
 *
 * @param isPossibleBiome - Whether the dimension's biome source can produce a biome. Java's
 *   `ChunkGeneratorStructureState` keeps a set only when at least one of its structures can
 *   generate in a biome the dimension has, so this is what separates the three dimensions.
 */
export const loadStructureSets = (
    sets: JavaRegistry,
    biomesOf: (structure: string) => ReadonlySet<string>,
    isPossibleBiome: (biome: string) => boolean
): NamedStructureSet[] => {
    const named: NamedStructureSet[] = [];

    for (const [id, document] of sets) {
        let set: StructureSet;
        try {
            set = parseStructureSet(document);
        } catch {
            // Extracted game data: a set this server cannot read places nothing, rather than
            // failing every chunk of the world over one file.
            continue;
        }

        const usable = set.structures.some((entry) => {
            for (const biome of biomesOf(entry.structure)) {
                if (isPossibleBiome(biome)) return true;
            }
            return false;
        });
        if (usable) named.push({ id, set });
    }

    return named;
};

/**
 * Every chunk of a range where a structure of this set may start.
 *
 * @returns The chunks in scan order, which for a random spread is region order.
 */
export const candidateChunksIn = (placement: StructurePlacement, seed: bigint, range: ChunkRange): ChunkPosition[] => {
    switch (placement.type) {
        case 'minecraft:random_spread':
            return spreadCandidates(placement, seed, range);
        case 'minecraft:dimension_origin':
            return inRange(range, { x: 0, z: 0 }) && isStructureChunk(placement, seed, 0, 0) ? [{ x: 0, z: 0 }] : [];
        case 'minecraft:concentric_rings':
            return concentricRingChunks(placement, seed).filter(
                (chunk) => inRange(range, chunk) && isStructureChunk(placement, seed, chunk.x, chunk.z)
            );
    }
};

/**
 * Every chunk a search from one chunk may find a structure of this set in.
 *
 * This is the reach of Java's `ChunkGenerator.findNearestMapStructure`, which is what `/locate`
 * and a thrown eye of ender ask. Its radius counts placement regions rather than chunks: a
 * random spread placement is walked one ring of regions at a time, so the command's radius of
 * 100 reaches 3400 chunks for a village set spaced 34 apart. A concentric ring placement has no
 * regions and Java visits all of its positions however far out they lie, which is how a
 * stronghold on the first ring, two thousand blocks away, is found from the origin.
 *
 * @param origin - The chunk the search starts from.
 * @param radius - How many rings of regions to walk, Java's `/locate` radius.
 * @returns The candidate chunks, unordered.
 */
export const searchCandidatesFrom = (
    placement: StructurePlacement,
    seed: bigint,
    origin: ChunkPosition,
    radius: number
): ChunkPosition[] => {
    switch (placement.type) {
        case 'minecraft:random_spread':
            return spreadCandidatesAround(placement, seed, origin, radius);
        case 'minecraft:dimension_origin':
            return isStructureChunk(placement, seed, 0, 0) ? [{ x: 0, z: 0 }] : [];
        case 'minecraft:concentric_rings':
            return concentricRingChunks(placement, seed).filter((chunk) =>
                isStructureChunk(placement, seed, chunk.x, chunk.z)
            );
    }
};

/**
 * The one chunk each region within `radius` regions of the origin's offers.
 *
 * Java's `getPotentialStructureChunk(seed, x + spacing * j, z + spacing * k)` for every `j` and
 * `k` in the radius, which is the region grid around the origin's own region. Nothing is cut
 * at a chunk boundary: a region on the edge contributes its chunk wherever in the region it
 * falls, as Java's does.
 */
const spreadCandidatesAround = (
    placement: RandomSpreadPlacement,
    seed: bigint,
    origin: ChunkPosition,
    radius: number
): ChunkPosition[] => {
    const candidates: ChunkPosition[] = [];
    const originRegionX = Math.floor(origin.x / placement.spacing);
    const originRegionZ = Math.floor(origin.z / placement.spacing);

    for (let regionX = originRegionX - radius; regionX <= originRegionX + radius; regionX++) {
        for (let regionZ = originRegionZ - radius; regionZ <= originRegionZ + radius; regionZ++) {
            const chunk = potentialStructureChunk(
                placement,
                seed,
                regionX * placement.spacing,
                regionZ * placement.spacing
            );
            if (isStructureChunk(placement, seed, chunk.x, chunk.z)) candidates.push(chunk);
        }
    }

    return candidates;
};

/** The one chunk each region overlapping the range offers, kept when it falls inside. */
const spreadCandidates = (placement: RandomSpreadPlacement, seed: bigint, range: ChunkRange): ChunkPosition[] => {
    const candidates: ChunkPosition[] = [];
    const minRegionX = Math.floor(range.minChunkX / placement.spacing);
    const maxRegionX = Math.floor(range.maxChunkX / placement.spacing);
    const minRegionZ = Math.floor(range.minChunkZ / placement.spacing);
    const maxRegionZ = Math.floor(range.maxChunkZ / placement.spacing);

    for (let regionX = minRegionX; regionX <= maxRegionX; regionX++) {
        for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ++) {
            const chunk = potentialStructureChunk(
                placement,
                seed,
                regionX * placement.spacing,
                regionZ * placement.spacing
            );
            if (!inRange(range, chunk)) continue;
            if (!isStructureChunk(placement, seed, chunk.x, chunk.z)) continue;

            candidates.push(chunk);
        }
    }

    return candidates;
};

const inRange = (range: ChunkRange, chunk: ChunkPosition): boolean =>
    chunk.x >= range.minChunkX &&
    chunk.x <= range.maxChunkX &&
    chunk.z >= range.minChunkZ &&
    chunk.z <= range.maxChunkZ;

/**
 * Which structure of a set starts in a chunk.
 *
 * Java draws the weighted pick from a stream seeded by the world seed and the chunk, then starts
 * the structure's own layout from a second stream seeded identically. Both are reproduced:
 * {@link structureRandomSeed} is the seed, and this draws from a source of its own so the layout
 * sees an untouched stream.
 */
export const chooseStructure = (set: StructureSet, seed: bigint, chunkX: number, chunkZ: number): string | undefined =>
    pickStructure(set, createLegacyRandom(structureRandomSeed(seed, chunkX, chunkZ)));

/** The seed Java gives both the weighted pick and the structure's own layout. */
export const structureRandomSeed = (seed: bigint, chunkX: number, chunkZ: number): bigint =>
    largeFeatureSeed(seed, chunkX, chunkZ);

/**
 * Expands a structure's `biomes` field into the biomes it names.
 *
 * The field is a biome identifier, a `#tag` reference or a list of either, and a tag's `values`
 * may hold further references. A reference this server does not carry contributes nothing, which
 * makes the structure generate in fewer biomes rather than in all of them.
 */
export const createBiomeExpander = (biomeTags: JavaRegistry): ((spec: unknown) => ReadonlySet<string>) => {
    const tags = new Map<string, ReadonlySet<string>>();

    const expandTag = (tag: string, seen: Set<string>): ReadonlySet<string> => {
        const cached = tags.get(tag);
        if (cached !== undefined) return cached;
        if (seen.has(tag)) return new Set();

        seen.add(tag);
        const document = biomeTags.get(tag);
        const values = (document as { values?: unknown } | undefined)?.values;
        const members = new Set<string>();
        if (Array.isArray(values)) {
            for (const entry of values) {
                const name = typeof entry === 'string' ? entry : (entry as { id?: unknown })?.id;
                if (typeof name !== 'string') continue;

                for (const member of expand(name, seen)) members.add(member);
            }
        }

        tags.set(tag, members);
        return members;
    };

    const expand = (spec: unknown, seen: Set<string>): ReadonlySet<string> => {
        if (typeof spec === 'string') {
            return spec.startsWith('#') ? expandTag(spec.slice(1), seen) : new Set([spec]);
        }

        if (!Array.isArray(spec)) return new Set();

        const members = new Set<string>();
        for (const entry of spec) {
            for (const member of expand(entry, seen)) members.add(member);
        }
        return members;
    };

    return (spec) => expand(spec, new Set());
};
