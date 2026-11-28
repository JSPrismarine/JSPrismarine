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
import type {
    ChunkPosition,
    ConcentricRingsPlacement,
    RandomSource,
    RandomSpreadPlacement,
    StructurePlacement,
    StructureSet
} from '@jsprismarine/structures';
import {
    concentricRingChunks,
    createLegacyRandom,
    isStructureChunk,
    largeFeatureSeed,
    parseStructureSet,
    potentialStructureChunk,
    structureAttemptOrder
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

/** How many regions {@link CandidateChunkMemo} keeps before it starts over. */
const MEMO_LIMIT = 1 << 18;

/** The side of the square of chunks one memo tile covers, so a 17 chunk window reads at most four. */
const TILE_CHUNKS = 32;

/** Region order: x, then z, which is the order a scan visits the regions in. */
const byRegion =
    (spacing: number) =>
    (left: ChunkPosition, right: ChunkPosition): number =>
        Math.floor(left.x / spacing) - Math.floor(right.x / spacing) ||
        Math.floor(left.z / spacing) - Math.floor(right.z / spacing);

/**
 * {@link candidateChunksIn} with each region's answer remembered.
 *
 * A region's candidate is fixed by the seed, and the windows neighboring chunks scan overlap
 * almost entirely: a set spaced one chunk apart, such as the mineshafts, asks the same 289
 * regions of every chunk around it, and each answer is two seeded draws. The memo draws a tile of
 * regions once and keeps only the candidates it holds, so a later window reads a few tiles and
 * filters their candidates instead of visiting each region.
 */
export class CandidateChunkMemo {
    private readonly tiles = new Map<RandomSpreadPlacement, Map<string, readonly ChunkPosition[]>>();
    private readonly rings = new Map<StructurePlacement, readonly ChunkPosition[]>();
    private size = 0;
    private drawn = 0;

    /**
     * @param ringChunks - Where a concentric rings placement starts in a range once its positions
     *   are moved to their preferred biomes. Without it, the drawn positions are used as they are.
     */
    public constructor(
        private readonly seed: bigint,
        private readonly ringChunks?: (placement: ConcentricRingsPlacement, range: ChunkRange) => ChunkPosition[]
    ) {}

    /** How many random spread regions this memo has drawn a candidate for, for profiling. */
    public get regionsDrawn(): number {
        return this.drawn;
    }

    /** The same chunks, in the same order, as {@link candidateChunksIn} returns. */
    public in(placement: StructurePlacement, range: ChunkRange): ChunkPosition[] {
        if (placement.type === 'minecraft:random_spread') return this.spread(placement, range);

        // The resolver keeps its own answers, since moving a position costs a biome search.
        if (placement.type === 'minecraft:concentric_rings' && this.ringChunks !== undefined) {
            return this.ringChunks(placement, range);
        }

        let all = this.rings.get(placement);
        if (all === undefined) {
            all = candidateChunksIn(placement, this.seed, {
                minChunkX: Number.NEGATIVE_INFINITY,
                minChunkZ: Number.NEGATIVE_INFINITY,
                maxChunkX: Number.POSITIVE_INFINITY,
                maxChunkZ: Number.POSITIVE_INFINITY
            });
            this.rings.set(placement, all);
        }
        return all.filter((chunk) => inRange(range, chunk));
    }

    private spread(placement: RandomSpreadPlacement, range: ChunkRange): ChunkPosition[] {
        if (this.size >= MEMO_LIMIT) {
            this.tiles.clear();
            this.size = 0;
        }
        let tiles = this.tiles.get(placement);
        if (tiles === undefined) {
            tiles = new Map();
            this.tiles.set(placement, tiles);
        }

        const tileRegions = Math.max(1, Math.floor(TILE_CHUNKS / placement.spacing));
        const tileOf = (chunk: number): number => Math.floor(Math.floor(chunk / placement.spacing) / tileRegions);
        const candidates: ChunkPosition[] = [];
        let tilesRead = 0;
        for (let tileX = tileOf(range.minChunkX); tileX <= tileOf(range.maxChunkX); tileX++) {
            for (let tileZ = tileOf(range.minChunkZ); tileZ <= tileOf(range.maxChunkZ); tileZ++) {
                const key = `${tileX},${tileZ}`;
                let tile = tiles.get(key);
                if (tile === undefined) {
                    tile = this.drawTile(placement, tileX * tileRegions, tileZ * tileRegions, tileRegions);
                    tiles.set(key, tile);
                }
                for (const chunk of tile) if (inRange(range, chunk)) candidates.push(chunk);
                tilesRead++;
            }
        }
        // Tiles are read one after another, so a window spanning two needs the scan's order back.
        return tilesRead > 1 ? candidates.sort(byRegion(placement.spacing)) : candidates;
    }

    private drawTile(
        placement: RandomSpreadPlacement,
        minRegionX: number,
        minRegionZ: number,
        regions: number
    ): ChunkPosition[] {
        const candidates: ChunkPosition[] = [];
        for (let regionX = minRegionX; regionX < minRegionX + regions; regionX++) {
            for (let regionZ = minRegionZ; regionZ < minRegionZ + regions; regionZ++) {
                const chunk = regionCandidate(placement, this.seed, regionX, regionZ);
                if (chunk !== null) candidates.push(chunk);
            }
        }
        this.size += regions * regions;
        this.drawn += regions * regions;
        return candidates;
    }
}

/** The chunk a random spread region offers, or null when the placement's rules reject it. */
const regionCandidate = (
    placement: RandomSpreadPlacement,
    seed: bigint,
    regionX: number,
    regionZ: number
): ChunkPosition | null => {
    const chunk = potentialStructureChunk(placement, seed, regionX * placement.spacing, regionZ * placement.spacing);
    return isStructureChunk(placement, seed, chunk.x, chunk.z) ? chunk : null;
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
            const chunk = regionCandidate(placement, seed, regionX, regionZ);
            if (chunk !== null && inRange(range, chunk)) candidates.push(chunk);
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
 * The structures of a set a chunk tries, in the order Java tries them.
 *
 * Java draws a structure by weight from a stream seeded by the world seed and the chunk, and
 * when that structure cannot start there it draws again from the rest of the set. The layout of
 * each attempt starts from a second stream seeded identically. Both are reproduced:
 * {@link structureRandomSeed} is the seed, and this draws from a source of its own so each
 * layout sees an untouched stream.
 *
 * @javaSee ChunkGenerator.createStructures
 */
export const structureAttemptsAt = (
    set: StructureSet,
    seed: bigint,
    chunkX: number,
    chunkZ: number
): readonly string[] => structureAttemptOrder(set, createLegacyRandom(structureRandomSeed(seed, chunkX, chunkZ)));

/** The seed Java gives both the weighted pick and the structure's own layout. */
export const structureRandomSeed = (seed: bigint, chunkX: number, chunkZ: number): bigint =>
    largeFeatureSeed(seed, chunkX, chunkZ);

/**
 * Expands a registry reference into the identifiers it names.
 *
 * A reference is an identifier, a `#tag` or a list of either, and a tag's `values` may hold
 * further references. Built over one tag registry: a structure's `biomes` field expands over
 * `tags/worldgen/biome`, and the `#minecraft:village` a `/locate` names expands over
 * `tags/worldgen/structure`. A reference this server does not carry contributes nothing, which
 * makes a structure generate in fewer biomes rather than in all of them.
 */
export const createTagExpander = (tags: JavaRegistry): ((spec: unknown) => ReadonlySet<string>) => {
    const expanded = new Map<string, ReadonlySet<string>>();

    const expandTag = (tag: string, seen: Set<string>): ReadonlySet<string> => {
        const cached = expanded.get(tag);
        if (cached !== undefined) return cached;
        if (seen.has(tag)) return new Set();

        seen.add(tag);
        const document = tags.get(tag);
        const values = (document as { values?: unknown } | undefined)?.values;
        const members = new Set<string>();
        if (Array.isArray(values)) {
            for (const entry of values) {
                const name = typeof entry === 'string' ? entry : (entry as { id?: unknown })?.id;
                if (typeof name !== 'string') continue;

                for (const member of expand(name, seen)) members.add(member);
            }
        }

        expanded.set(tag, members);
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

/**
 * Java's horizontal biome search, the one that moves a stronghold to a biome it prefers.
 *
 * It scans every quart cell of the square `radius` blocks out from the point, z then x, at the
 * point's height, and keeps a matching cell by a reservoir draw: the first match outright, the
 * nth with a one in n chance. That is the overload a ring placement calls, which steps one quart
 * at a time and does not look for the closest match, so only the outermost square is walked and
 * the walk covers all of it.
 *
 * @param noiseBiome - The biome at a quart position.
 * @returns The block position of the cell kept, or undefined when none matched.
 * @javaSource BiomeSource.findBiomeHorizontal(IIIIILjava/util/function/Predicate;Lnet/minecraft/util/RandomSource;ZLnet/minecraft/world/level/levelgen/RandomState;)Lcom/mojang/datafixers/util/Pair;
 */
export const findBiomeHorizontal = (
    x: number,
    y: number,
    z: number,
    radius: number,
    matches: (biome: string) => boolean,
    random: RandomSource,
    noiseBiome: (quartX: number, quartY: number, quartZ: number) => string
): { x: number; y: number; z: number } | undefined => {
    const quartX = x >> 2;
    const quartZ = z >> 2;
    const quartRadius = radius >> 2;
    const quartY = y >> 2;
    let found: { x: number; y: number; z: number } | undefined;
    let count = 0;

    for (let dz = -quartRadius; dz <= quartRadius; dz++) {
        for (let dx = -quartRadius; dx <= quartRadius; dx++) {
            const cellX = quartX + dx;
            const cellZ = quartZ + dz;
            if (!matches(noiseBiome(cellX, quartY, cellZ))) continue;
            if (found === undefined || random.nextInt(count + 1) === 0) found = { x: cellX << 2, y, z: cellZ << 2 };
            count++;
        }
    }
    return found;
};
