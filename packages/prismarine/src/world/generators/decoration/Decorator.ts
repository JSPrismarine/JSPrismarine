import type Chunk from '../../chunk/Chunk';
import type { EntitySpawn } from '../../EntitySpawn';
import type Noise from '../Noise';
import type ChunkRandom from './ChunkRandom';

/** The runtime ids a decorator may place, resolved once per chunk by the generator. */
export type BlockPalette = Readonly<Record<string, number>>;

/** Everything a decorator is handed about the chunk it is working on. */
export interface DecorationContext {
    chunk: Chunk;
    chunkX: number;
    chunkZ: number;
    seed: number;

    /**
     * The surface height of each column, indexed `x * 16 + z`.
     *
     * Computed once by the terrain pass and shared, because every decorator needs it and
     * scanning the chunk downwards for it would cost more than generating the terrain did.
     */
    heights: Int32Array;

    /** The same noise the terrain was shaped from, for decorators that want to agree with it. */
    noise: Noise;

    /** Seeded from the world seed and this chunk's coordinates - see {@link ChunkRandom}. */
    random: ChunkRandom;

    palette: BlockPalette;

    /**
     * Where to record a mob that belongs to whatever this pass built.
     *
     * A pass appends; the world creates them when it first loads the chunk. See
     * {@link EntitySpawn} for why generation cannot simply add the entity itself.
     */
    spawns: EntitySpawn[];
}

/**
 * One pass over a freshly generated chunk.
 *
 * Terrain decides where the ground is; decorators put everything else on and inside it.
 * They are deliberately a list the generator walks in order, so ores can be placed before
 * caves cut through them, and so a plugin can add its own without touching the generator.
 */
export interface Decorator {
    /** Used in logs and tests. */
    readonly name: string;

    decorate(context: DecorationContext): void;
}

/** Column index into {@link DecorationContext.heights}. */
export const heightIndex = (x: number, z: number): number => x * 16 + z;
