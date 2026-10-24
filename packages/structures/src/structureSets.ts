/**
 * Structure sets and their placement: which chunks a structure may start in
 * for a given world seed.
 *
 * The three placement types and the four frequency reduction methods are
 * Java Edition 26.3's, read from the pinned server jar, down to the order
 * the random source is drawn from. The 21 vanilla structure sets use
 * `random_spread` 20 times and `concentric_rings` once, with `triangular`
 * spread on three and a frequency below one on three.
 */
import { createLegacyRandom, largeFeatureSeed, largeFeatureWithSaltSeed } from './random';
import { StructureFormatError } from './types';

/** A chunk position, in chunk coordinates. */
export interface ChunkPosition {
    readonly x: number;
    readonly z: number;
}

/** How a random spread placement picks the offset inside a region. */
export type SpreadType = 'linear' | 'triangular';

/** Which rule thins a placement whose `frequency` is below one. */
export type FrequencyReductionMethod = 'default' | 'legacy_type_1' | 'legacy_type_2' | 'legacy_type_3';

/** The three `structure_placement` types Java 26.3 registers. */
export const STRUCTURE_PLACEMENT_TYPES = [
    'minecraft:concentric_rings',
    'minecraft:dimension_origin',
    'minecraft:random_spread'
] as const;

/** Fields every placement type carries. */
interface CommonPlacement {
    /** Mixed into the seed so two sets in one region draw different positions. */
    readonly salt: number;
    /** The share of eligible chunks that keep the structure; 1 keeps all of them. */
    readonly frequency: number;
    readonly frequencyReductionMethod: FrequencyReductionMethod;
    /** The block offset `/locate` reports, which does not move the structure. */
    readonly locateOffset: readonly [number, number, number];
    /** A set whose structures push this one away, with the chunk radius it clears. */
    readonly exclusionZone?: { readonly otherSet: string; readonly chunkCount: number };
}

/** A placement that scatters one structure per `spacing` by `spacing` region. */
export interface RandomSpreadPlacement extends CommonPlacement {
    readonly type: 'minecraft:random_spread';
    /** The region size in chunks. */
    readonly spacing: number;
    /** The chunks at the far edge of a region that the structure never lands in. */
    readonly separation: number;
    readonly spreadType: SpreadType;
}

/** A placement that lays structures out on rings around the world origin. */
export interface ConcentricRingsPlacement extends CommonPlacement {
    readonly type: 'minecraft:concentric_rings';
    /** The ring spacing in chunks. */
    readonly distance: number;
    /** How many structures the first ring holds. */
    readonly spread: number;
    /** How many structures the placement produces in total. */
    readonly count: number;
    /** The biome tag the real placement snaps each position to. */
    readonly preferredBiomes?: string;
}

/** A placement that puts one structure at the dimension's origin chunk. */
export interface DimensionOriginPlacement extends CommonPlacement {
    readonly type: 'minecraft:dimension_origin';
}

/** One of the three placement types. */
export type StructurePlacement = RandomSpreadPlacement | ConcentricRingsPlacement | DimensionOriginPlacement;

/** A `worldgen/structure_set`: a placement and the weighted structures it places. */
export interface StructureSet {
    readonly placement: StructurePlacement;
    readonly structures: readonly { readonly structure: string; readonly weight: number }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number =>
    typeof source[key] === 'number' ? source[key] : fallback;

const tripleAt = (value: unknown): readonly [number, number, number] =>
    Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number')
        ? [value[0] as number, value[1] as number, value[2] as number]
        : [0, 0, 0];

const commonOf = (definition: Record<string, unknown>): CommonPlacement => {
    const zone = definition.exclusion_zone;
    return {
        salt: numberAt(definition, 'salt', 0),
        frequency: numberAt(definition, 'frequency', 1),
        frequencyReductionMethod:
            typeof definition.frequency_reduction_method === 'string'
                ? (definition.frequency_reduction_method as FrequencyReductionMethod)
                : 'default',
        locateOffset: tripleAt(definition.locate_offset),
        ...(isRecord(zone) && typeof zone.other_set === 'string'
            ? { exclusionZone: { otherSet: zone.other_set, chunkCount: numberAt(zone, 'chunk_count', 0) } }
            : {})
    };
};

/**
 * Reads a `structure_placement` object from a Java `worldgen/structure_set`.
 *
 * @throws {StructureFormatError} When the type is not one of the three Java registers.
 */
export const parseStructurePlacement = (definition: unknown): StructurePlacement => {
    if (!isRecord(definition)) throw new StructureFormatError('structure placement: expected an object');
    const common = commonOf(definition);

    switch (definition.type) {
        case 'minecraft:random_spread':
            return {
                type: 'minecraft:random_spread',
                ...common,
                spacing: numberAt(definition, 'spacing', 1),
                separation: numberAt(definition, 'separation', 0),
                spreadType: definition.spread_type === 'triangular' ? 'triangular' : 'linear'
            };
        case 'minecraft:concentric_rings':
            return {
                type: 'minecraft:concentric_rings',
                ...common,
                distance: numberAt(definition, 'distance', 1),
                spread: numberAt(definition, 'spread', 1),
                count: numberAt(definition, 'count', 1),
                ...(typeof definition.preferred_biomes === 'string'
                    ? { preferredBiomes: definition.preferred_biomes }
                    : {})
            };
        case 'minecraft:dimension_origin':
            return { type: 'minecraft:dimension_origin', ...common };
        default:
            throw new StructureFormatError(`structure placement: unknown type ${String(definition.type)}`);
    }
};

/**
 * Reads a `worldgen/structure_set` file.
 *
 * @throws {StructureFormatError} When the file has no placement or no structure list.
 */
export const parseStructureSet = (definition: unknown): StructureSet => {
    if (!isRecord(definition)) throw new StructureFormatError('structure set: expected an object');
    if (!Array.isArray(definition.structures)) throw new StructureFormatError('structure set: no structures');

    return {
        placement: parseStructurePlacement(definition.placement),
        structures: definition.structures.map((entry) => {
            if (!isRecord(entry) || typeof entry.structure !== 'string') {
                throw new StructureFormatError('structure set: an entry names no structure');
            }
            return { structure: entry.structure, weight: numberAt(entry, 'weight', 1) };
        })
    };
};

/**
 * The one chunk in a region that a random spread placement would use, whether
 * or not the given chunk is that one.
 *
 * @param chunkX - Any chunk in the region, in chunk coordinates.
 */
export const potentialStructureChunk = (
    placement: RandomSpreadPlacement,
    seed: bigint,
    chunkX: number,
    chunkZ: number
): ChunkPosition => {
    const regionX = Math.floor(chunkX / placement.spacing);
    const regionZ = Math.floor(chunkZ / placement.spacing);
    const random = createLegacyRandom(largeFeatureWithSaltSeed(seed, regionX, regionZ, placement.salt));
    const range = placement.spacing - placement.separation;

    const draw = (): number =>
        placement.spreadType === 'triangular'
            ? Math.floor((random.nextInt(range) + random.nextInt(range)) / 2)
            : random.nextInt(range);

    const offsetX = draw();
    const offsetZ = draw();
    return { x: regionX * placement.spacing + offsetX, z: regionZ * placement.spacing + offsetZ };
};

/** Java's four frequency reduction rules, which thin a placement below frequency one. */
const passesFrequency = (placement: StructurePlacement, seed: bigint, chunkX: number, chunkZ: number): boolean => {
    if (placement.frequency >= 1) return true;

    switch (placement.frequencyReductionMethod) {
        case 'default': {
            // Java passes the salt where the method expects x, and the chunk
            // coordinates one slot along. Reproduced as written.
            const random = createLegacyRandom(largeFeatureWithSaltSeed(seed, placement.salt, chunkX, chunkZ));
            return random.nextFloat() < placement.frequency;
        }
        case 'legacy_type_1':
            return createLegacyRandom(largeFeatureSeed(seed, chunkX, chunkZ)).nextDouble() < placement.frequency;
        case 'legacy_type_2':
            return (
                createLegacyRandom(largeFeatureWithSaltSeed(seed, chunkX, chunkZ, 10387320)).nextFloat() <
                placement.frequency
            );
        case 'legacy_type_3': {
            const random = createLegacyRandom(BigInt((chunkX >> 4) ^ ((chunkZ >> 4) << 4)) ^ seed);
            random.nextInt();
            return random.nextInt(Math.trunc(1 / placement.frequency)) === 0;
        }
    }
};

/**
 * Whether a structure of this set may start in the given chunk for a seed.
 *
 * Exclusion zones are not applied here, because they depend on another set's
 * placement; {@link StructurePlacement.exclusionZone} names the set and the
 * radius so the caller can apply it.
 */
export const isStructureChunk = (
    placement: StructurePlacement,
    seed: bigint,
    chunkX: number,
    chunkZ: number
): boolean => {
    if (!passesFrequency(placement, seed, chunkX, chunkZ)) return false;

    switch (placement.type) {
        case 'minecraft:random_spread': {
            const chunk = potentialStructureChunk(placement, seed, chunkX, chunkZ);
            return chunk.x === chunkX && chunk.z === chunkZ;
        }
        case 'minecraft:dimension_origin':
            return chunkX === 0 && chunkZ === 0;
        case 'minecraft:concentric_rings':
            return concentricRingChunks(placement, seed).some((chunk) => chunk.x === chunkX && chunk.z === chunkZ);
    }
};

/**
 * Every chunk in a rectangle of chunks where a structure of this set may
 * start, in scan order.
 */
export const structureSetCandidates = (
    placement: StructurePlacement,
    seed: bigint,
    region: { minChunkX: number; minChunkZ: number; maxChunkX: number; maxChunkZ: number }
): ChunkPosition[] => {
    const candidates: ChunkPosition[] = [];
    for (let x = region.minChunkX; x <= region.maxChunkX; x++) {
        for (let z = region.minChunkZ; z <= region.maxChunkZ; z++) {
            if (isStructureChunk(placement, seed, x, z)) candidates.push({ x, z });
        }
    }
    return candidates;
};

/**
 * The ring positions a concentric rings placement produces, which is how
 * strongholds are laid out.
 *
 * Java then snaps each position to the nearest chunk whose biome is in
 * `preferred_biomes`. That search needs a biome source, so these are the
 * unsnapped positions and the caller moves them.
 */
export const concentricRingChunks = (placement: ConcentricRingsPlacement, seed: bigint): ChunkPosition[] => {
    const random = createLegacyRandom(largeFeatureSeed(seed, 0, 0));
    const positions: ChunkPosition[] = [];
    let angle = random.nextDouble() * Math.PI * 2;
    let inRing = 0;
    let ring = 0;
    let spread = placement.spread;

    for (let index = 0; index < placement.count; index++) {
        const radius =
            4 * placement.distance +
            placement.distance * ring * 6 +
            (random.nextDouble() - 0.5) * placement.distance * 2.5;
        positions.push({ x: Math.round(Math.cos(angle) * radius), z: Math.round(Math.sin(angle) * radius) });

        angle += (Math.PI * 2) / spread;
        if (++inRing === spread) {
            ring++;
            inRing = 0;
            spread = Math.min(spread + (2 * spread) / (ring + 1), placement.count - index);
            angle += random.nextDouble() * Math.PI * 2;
        }
    }
    return positions;
};

/**
 * The structure a set places in one chunk, drawn by weight.
 *
 * @returns The chosen structure's identifier, or undefined for an empty set.
 */
export const pickStructure = (set: StructureSet, random: { nextInt(bound: number): number }): string | undefined => {
    const total = set.structures.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return undefined;

    let remaining = random.nextInt(total);
    for (const entry of set.structures) {
        remaining -= entry.weight;
        if (remaining < 0) return entry.structure;
    }
    return set.structures.at(-1)?.structure;
};
