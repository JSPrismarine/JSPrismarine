/**
 * The world blender's view of a save: which stored chunks are old generation, and what Java's
 * `BlendingData` reads out of each of them.
 *
 * The blender itself is `@jsprismarine/worldgen`'s and speaks Java. The save holds Bedrock blocks
 * and Bedrock biome ids, so this module is the translation in between: a stored chunk becomes an
 * {@link OldChunkView} through `@jsprismarine/mapping`, the Java block tags and the Bedrock
 * collision boxes, and each old chunk's record is calculated once on this thread and then handed
 * to terrain tasks as a cloneable {@link OldChunkRecord}.
 */
import { FULL_BLOCK, bedrockCollisionTopOf } from '@jsprismarine/blocks';
import type { BlockOracle } from '@jsprismarine/features';
import { bedrockBiomeToJava, bedrockBlockStateToJava } from '@jsprismarine/mapping';
import type { BiomeResolver } from '@jsprismarine/worldgen';
import { Blender, HEIGHT_BLENDING_RANGE_CHUNKS, newSidesOf } from '@jsprismarine/worldgen/blending/Blender';
import type { BlendingDataSnapshot, OldChunkView } from '@jsprismarine/worldgen/blending/BlendingData';
import { BLENDING_SURFACE_BLOCKS, BlendingData } from '@jsprismarine/worldgen/blending/BlendingData';

import { BlockRuntimeIds } from '../../../block/state/BlockRuntimeIds';
import type Chunk from '../../chunk/Chunk';
import { isOldGeneration } from '../../chunk/ChunkGeneration';
import type { StoredChunkReader } from '../../providers/Provider';
import { isRecord } from '../../../utils/isRecord';

/** One old chunk's calculated record, as a terrain task carries it. */
export interface OldChunkRecord {
    readonly chunkX: number;
    readonly chunkZ: number;
    readonly snapshot: BlendingDataSnapshot;
}

/** How far around a terrain tile its old chunks are collected: `Blender.of`'s reach. */
export const BLENDING_RECORD_RADIUS = HEIGHT_BLENDING_RANGE_CHUNKS;

/** The two mushroom blocks Java's `isGround` names, besides its two tags. */
const MUSHROOM_BLOCKS = new Set(['minecraft:brown_mushroom_block', 'minecraft:red_mushroom_block']);

const SURFACE_BLOCKS = new Set(BLENDING_SURFACE_BLOCKS);

/** What one Bedrock block state is to the blender. */
interface BlockFacts {
    readonly surface: boolean;
    readonly ground: boolean;
}

const AIR_FACTS: BlockFacts = { surface: false, ground: false };

/**
 * Builds the blender's view of a stored Bedrock chunk.
 *
 * @param oracle - The Java block facts, for `#minecraft:leaves` and `#minecraft:logs`.
 * @param fallbackBiome - The biome for a quart whose stored Bedrock biome has no Java id, one of
 *   the legacy biomes Java 26.3 deleted. It answers with the current biome source's own biome.
 */
export const oldChunkViewOf = (chunk: Chunk, oracle: BlockOracle, fallbackBiome: BiomeResolver): OldChunkView => {
    const facts = new Map<number, BlockFacts>();
    const factsAt = (x: number, y: number, z: number): BlockFacts => {
        const runtimeId = chunk.getBlockRuntimeId(x, y, z);
        let known = facts.get(runtimeId);
        if (known === undefined) {
            known = blockFactsOf(runtimeId, oracle);
            facts.set(runtimeId, known);
        }
        return known;
    };

    const quartX = chunk.getX() * 4;
    const quartZ = chunk.getZ() * 4;
    return {
        isSurfaceBlock: (x, y, z) => factsAt(x, y, z).surface,
        isGround: (x, y, z) => factsAt(x, y, z).ground,
        noiseBiome: (x, y, z) => {
            const stored = bedrockBiomeToJava(chunk.getBiome(x * 4, y * 4, z * 4));
            return stored.kind === 'mapped' ? stored.java : fallbackBiome(quartX + x, y, quartZ + z);
        }
    };
};

const blockFactsOf = (runtimeId: number, oracle: BlockOracle): BlockFacts => {
    const bedrock = BlockRuntimeIds.getState(runtimeId);
    if (bedrock === null) return AIR_FACTS;
    const mapped = bedrockBlockStateToJava(bedrock.name, bedrock.properties);
    if (mapped.kind !== 'mapped') return AIR_FACTS;

    const java = mapped.java;
    const ground =
        !oracle.isAir(java) &&
        !oracle.hasTag(java, 'minecraft:leaves') &&
        !oracle.hasTag(java, 'minecraft:logs') &&
        !MUSHROOM_BLOCKS.has(java.name) &&
        // The capture's own collision height, not `BlockShapes.collisionTopOf`, which opens every
        // door so mobs can path through doorways. Java's `isGround` asks about the shape itself.
        (bedrockCollisionTopOf(bedrock.name, runtimeId) ?? FULL_BLOCK) > 0;
    return { surface: SURFACE_BLOCKS.has(java.name), ground };
};

/** Whether a value is a {@link OldChunkRecord} a worker can rebuild a record from. */
export const isOldChunkRecord = (value: unknown): value is OldChunkRecord => {
    if (!isRecord(value) || typeof value['chunkX'] !== 'number' || typeof value['chunkZ'] !== 'number') return false;
    const snapshot = value['snapshot'];
    return (
        isRecord(snapshot) &&
        typeof snapshot['minSection'] === 'number' &&
        typeof snapshot['maxSection'] === 'number' &&
        snapshot['heights'] instanceof Float32Array &&
        Array.isArray(snapshot['densities']) &&
        Array.isArray(snapshot['biomes'])
    );
};

/**
 * Whether a cloned task input's optional `blending` field is absent or a list of
 * {@link OldChunkRecord}s, for the task guards of every worker pipeline.
 */
export const hasValidBlending = (value: object): boolean =>
    !('blending' in value) ||
    value.blending === undefined ||
    (Array.isArray(value.blending) && value.blending.every(isOldChunkRecord));

/**
 * The blender for a chunk, from the old chunks a task carried. Undefined or empty records give
 * {@link Blender.EMPTY}.
 */
export const blenderFor = (chunkX: number, chunkZ: number, records: readonly OldChunkRecord[] | undefined): Blender => {
    if (records === undefined || records.length === 0) return Blender.EMPTY;
    const byChunk = new Map<string, BlendingData>();
    for (const record of records) {
        byChunk.set(`${record.chunkX},${record.chunkZ}`, BlendingData.fromSnapshot(record.snapshot));
    }
    return Blender.of(chunkX, chunkZ, (x, z) => byChunk.get(`${x},${z}`));
};

/**
 * The noise biomes of an area near old chunks: each quart takes the answer of the blender of the
 * chunk it is in, which is what Java stores in that chunk's biome palette and what its surface
 * pass and feature pass then read. Without records it is `base` itself.
 *
 * @param records - The old chunks within the blender's reach of every chunk the caller asks about.
 */
export const blendedBiomeCells = (
    records: readonly OldChunkRecord[] | undefined,
    base: BiomeResolver
): BiomeResolver => {
    if (records === undefined || records.length === 0) return base;
    const byChunk = new Map<string, BlendingData>();
    for (const record of records) {
        byChunk.set(`${record.chunkX},${record.chunkZ}`, BlendingData.fromSnapshot(record.snapshot));
    }
    const lookup = (x: number, z: number): BlendingData | undefined => byChunk.get(`${x},${z}`);
    const blenders = new Map<string, Blender>();
    return (quartX, quartY, quartZ) => {
        const chunkX = quartX >> 2;
        const chunkZ = quartZ >> 2;
        const key = `${chunkX},${chunkZ}`;
        let blender = blenders.get(key);
        if (blender === undefined) {
            blender = Blender.of(chunkX, chunkZ, lookup);
            blenders.set(key, blender);
        }
        return blender.blendBiome(quartX, quartY, quartZ) ?? base(quartX, quartY, quartZ);
    };
};

/** How many old chunks' records one dimension keeps, which bounds the memory a large old world takes. */
const RECORD_CACHE_SIZE = 1024;

/**
 * How many positions' oldness one dimension remembers. A radius scan asks about at most 361
 * positions, so this holds the answers for well over a hundred scans' worth of explored area.
 */
const OLDNESS_CACHE_SIZE = 65_536;

/** Adds an entry to a map used as a cache, first dropping the oldest entry once it holds `limit`. */
const remember = <K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void => {
    if (cache.size >= limit) {
        const oldest = cache.keys().next();
        if (oldest.done !== true) cache.delete(oldest.value);
    }
    cache.set(key, value);
};

/**
 * The old chunks of one dimension's save, as the generator asks about them.
 *
 * Both answers are cached up to a bound and asked again after that. Asking again gives the same
 * answer for whether a position is old, because a stored chunk never stops being old and a
 * position the save does not hold only ever becomes a new chunk. A record recalculated after it
 * was dropped reads the chunk's blocks again, as Java recalculates them each time it loads a
 * chunk.
 */
export class OldChunks {
    private readonly oldness = new Map<string, boolean>();
    private readonly records = new Map<string, BlendingDataSnapshot>();

    public constructor(
        private readonly stored: StoredChunkReader,
        private readonly oracle: BlockOracle,
        private readonly fallbackBiome: BiomeResolver
    ) {}

    /** Whether the stored chunk at a position is old generation. */
    public isOld(chunkX: number, chunkZ: number): boolean {
        const key = `${chunkX},${chunkZ}`;
        let old = this.oldness.get(key);
        if (old === undefined) {
            const generation = this.stored.generationAt(chunkX, chunkZ);
            old = generation !== undefined && isOldGeneration(generation);
            remember(this.oldness, key, old, OLDNESS_CACHE_SIZE);
        }
        return old;
    }

    /** Whether any old chunk lies within a square radius of a chunk. */
    public anyWithin(chunkX: number, chunkZ: number, radius: number): boolean {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (this.isOld(chunkX + dx, chunkZ + dz)) return true;
            }
        }
        return false;
    }

    /**
     * The records of the old chunks within a square radius of a chunk, or undefined when there
     * are none, which is the common case and costs no record at all.
     *
     * @param radius - {@link BLENDING_RECORD_RADIUS} for one chunk; one more for a feature pass,
     *   whose view reaches the chunks around it.
     */
    public recordsAround(
        chunkX: number,
        chunkZ: number,
        radius = BLENDING_RECORD_RADIUS
    ): OldChunkRecord[] | undefined {
        let records: OldChunkRecord[] | undefined;
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const x = chunkX + dx;
                const z = chunkZ + dz;
                if (!this.isOld(x, z)) continue;
                const snapshot = this.recordOf(x, z);
                if (snapshot === undefined) continue;
                (records ??= []).push({ chunkX: x, chunkZ: z, snapshot });
            }
        }
        return records;
    }

    private recordOf(chunkX: number, chunkZ: number): BlendingDataSnapshot | undefined {
        const key = `${chunkX},${chunkZ}`;
        const cached = this.records.get(key);
        if (cached !== undefined) return cached;

        const blending = this.stored.generationAt(chunkX, chunkZ)?.blending;
        const chunk = blending === undefined ? undefined : this.stored.terrainAt(chunkX, chunkZ);
        if (blending === undefined || chunk === undefined) return undefined;

        const data = BlendingData.unpack(blending);
        data.calculate(
            oldChunkViewOf(chunk, this.oracle, this.fallbackBiome),
            newSidesOf(chunkX, chunkZ, (x, z) => this.isOld(x, z))
        );
        const snapshot = data.snapshot();
        remember(this.records, key, snapshot, RECORD_CACHE_SIZE);
        return snapshot;
    }
}
