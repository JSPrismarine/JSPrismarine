import { AIR } from '../chunk/FluidPicker';

/** The side length of a chunk column in blocks. */
const CHUNK_SIZE = 16;

/**
 * The chunk the surface pass reads and writes.
 *
 * The terrain core returns block states rather than writing them, so this is the seam between
 * it and whatever stores a chunk. {@link BlockArraySurfaceChunk} is the plain-array adapter;
 * a caller with its own storage implements the four methods against that instead.
 */
export interface SurfaceChunk {
    /** The chunk x coordinate, in chunks. */
    readonly chunkX: number;
    /** The chunk z coordinate, in chunks. */
    readonly chunkZ: number;
    /** The lowest y the chunk holds. */
    readonly minY: number;
    /** The highest y the chunk holds. */
    readonly maxY: number;
    /** The Java block state identifier at a block position, `minecraft:air` where empty. */
    getBlock(x: number, y: number, z: number): string;
    /** Writes a block state; a y outside the chunk is ignored, as it is in Java. */
    setBlock(x: number, y: number, z: number, state: string): void;
    /**
     * The y of the highest block in a column that is not air, or `minY - 1` when the column is
     * empty. This is Java's `WORLD_SURFACE_WG` heightmap, frozen at the end of the terrain fill.
     */
    surfaceHeight(localX: number, localZ: number): number;
}

/** How a {@link BlockArraySurfaceChunk} reads its starting terrain. */
export interface BlockArraySurfaceChunkOptions {
    /** The chunk x coordinate, in chunks. */
    readonly chunkX: number;
    /** The chunk z coordinate, in chunks. */
    readonly chunkZ: number;
    /** The lowest y the chunk holds. */
    readonly minY: number;
    /** One column of block state identifiers, ordered from `minY` upward. */
    readonly column: (localX: number, localZ: number) => readonly string[];
}

/**
 * A chunk held as 256 arrays of block state identifiers.
 *
 * It takes a copy of the terrain the chunk sampler produced and computes the surface
 * heightmap once, which is what the surface pass needs and all it needs. Java recomputes the
 * heightmap as blocks are written; the surface pass does not, because the pass runs after the
 * heightmap is primed and before anything else touches it.
 */
export class BlockArraySurfaceChunk implements SurfaceChunk {
    /** @inheritDoc */
    public readonly chunkX: number;
    /** @inheritDoc */
    public readonly chunkZ: number;
    /** @inheritDoc */
    public readonly minY: number;
    /** @inheritDoc */
    public readonly maxY: number;

    private readonly columns: string[][] = [];
    private readonly heights: number[] = [];

    public constructor(options: BlockArraySurfaceChunkOptions) {
        this.chunkX = options.chunkX;
        this.chunkZ = options.chunkZ;
        this.minY = options.minY;

        let height = 0;
        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                const column = [...options.column(localX, localZ)];
                if (height === 0) height = column.length;
                else if (column.length !== height) {
                    throw new RangeError(`Column ${localX},${localZ} has ${column.length} blocks, expected ${height}`);
                }
                this.columns[localX * CHUNK_SIZE + localZ] = column;
                let top = this.minY - 1;
                for (let index = column.length - 1; index >= 0; index--) {
                    if (column[index] !== AIR) {
                        top = this.minY + index;
                        break;
                    }
                }
                this.heights[localX * CHUNK_SIZE + localZ] = top;
            }
        }
        this.maxY = this.minY + height - 1;
    }

    /** @inheritDoc */
    public getBlock(x: number, y: number, z: number): string {
        if (y < this.minY || y > this.maxY) return AIR;
        return (this.column(x, z)[y - this.minY] ?? AIR) as string;
    }

    /** @inheritDoc */
    public setBlock(x: number, y: number, z: number, state: string): void {
        if (y < this.minY || y > this.maxY) return;
        this.column(x, z)[y - this.minY] = state;
    }

    /** @inheritDoc */
    public surfaceHeight(localX: number, localZ: number): number {
        return this.heights[(localX & 15) * CHUNK_SIZE + (localZ & 15)] as number;
    }

    private column(x: number, z: number): string[] {
        return this.columns[(x & 15) * CHUNK_SIZE + (z & 15)] as string[];
    }
}
