import type Chunk from '../../chunk/Chunk';
import type { EntitySpawn } from '../../EntitySpawn';
import type ChunkRandom from '../decoration/ChunkRandom';
import type StructurePlacement from './StructurePlacement';

/** An axis-aligned box in world coordinates, inclusive at both ends. */
export interface BoundingBox {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
}

/** Whether two boxes share any block. Y is ignored: structures are laid out on the ground plane. */
export const overlapsHorizontally = (a: BoundingBox, b: BoundingBox, margin = 0): boolean =>
    a.minX - margin <= b.maxX && a.maxX + margin >= b.minX && a.minZ - margin <= b.maxZ && a.maxZ + margin >= b.minZ;

/** Whether a box reaches into the given chunk at all. */
export const touchesChunk = (box: BoundingBox, chunkX: number, chunkZ: number): boolean => {
    const minX = chunkX * 16;
    const minZ = chunkZ * 16;
    return box.minX <= minX + 15 && box.maxX >= minX && box.minZ <= minZ + 15 && box.maxZ >= minZ;
};

/**
 * How high the ground is, anywhere in the world.
 *
 * A structure is planned once for the whole of itself and then drawn into each chunk it covers, so
 * it constantly needs to know the height of ground it is not currently allowed to touch. This is
 * that question, answered from the terrain function rather than from any chunk - see
 * `TerrainShape` for why it has to be.
 */
export interface TerrainSampler {
    heightAt(x: number, z: number): number;
    readonly seaLevel: number;
    readonly floor: number;
    readonly ceiling: number;
}

/**
 * A structure writing into one chunk, in world coordinates.
 *
 * The whole point: a village is planned as one thing spanning a couple of hundred blocks, and then
 * drawn once per chunk it touches. Each of those passes draws the *entire* village and this throws
 * away everything that falls outside the chunk in hand. That is what lets a house straddle a chunk
 * border without either half knowing, and it is why nothing here reads the chunk to decide what to
 * do - a decision that depended on blocks only one of the passes can see would come out differently
 * in the two chunks and split the house in half.
 *
 * Writes outside the chunk are dropped silently rather than raising, because for every chunk but
 * one that is the normal and expected case.
 */
export class StructureCanvas {
    private readonly originX: number;
    private readonly originZ: number;
    private readonly floor: number;
    private readonly ceiling: number;

    public constructor(private readonly chunk: Chunk) {
        this.originX = chunk.getX() * 16;
        this.originZ = chunk.getZ() * 16;
        this.floor = chunk.getMinY();
        this.ceiling = chunk.getMaxY();
    }

    /** Whether a world position is one this canvas may write to. */
    public covers(x: number, y: number, z: number): boolean {
        return (
            x >= this.originX &&
            x <= this.originX + 15 &&
            z >= this.originZ &&
            z <= this.originZ + 15 &&
            y >= this.floor &&
            y <= this.ceiling
        );
    }

    /**
     * Places a block, if the position is inside this chunk and the block exists.
     * @param {number} x - World x.
     * @param {number} y - World y.
     * @param {number} z - World z.
     * @param {number | null} runtimeId - What to place; null is a block this server does not have,
     * which is skipped rather than treated as an error - see `StructureBlocks.blockId`.
     */
    public set(x: number, y: number, z: number, runtimeId: number | null): void {
        if (runtimeId === null || !this.covers(x, y, z)) return;
        this.chunk.setBlockRuntimeId(x - this.originX, y, z - this.originZ, runtimeId);
    }

    /**
     * Reads a block back.
     * @returns {number | null} The runtime id, or null when the position is outside this chunk and
     * therefore not something this pass is allowed to know about.
     */
    public get(x: number, y: number, z: number): number | null {
        if (!this.covers(x, y, z)) return null;
        return this.chunk.getBlockRuntimeId(x - this.originX, y, z - this.originZ);
    }

    /** Fills a box, inclusive at both ends. Order of the corners does not matter. */
    public fill(
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        runtimeId: number | null
    ): void {
        if (runtimeId === null) return;

        // Clipped to the chunk before looping rather than inside `set`, so drawing a village into
        // the eight chunks it does not overlap much of costs almost nothing.
        const minX = Math.max(Math.min(x0, x1), this.originX);
        const maxX = Math.min(Math.max(x0, x1), this.originX + 15);
        const minZ = Math.max(Math.min(z0, z1), this.originZ);
        const maxZ = Math.min(Math.max(z0, z1), this.originZ + 15);
        const minY = Math.max(Math.min(y0, y1), this.floor);
        const maxY = Math.min(Math.max(y0, y1), this.ceiling);

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                this.chunk.fillColumn(x - this.originX, z - this.originZ, minY, maxY, runtimeId);
            }
        }
    }

    /** The same box, but only where it is currently the given block. */
    public replace(
        x0: number,
        y0: number,
        z0: number,
        x1: number,
        y1: number,
        z1: number,
        from: number,
        to: number | null
    ): void {
        if (to === null) return;

        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
            for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
                for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
                    if (this.get(x, y, z) === from) this.set(x, y, z, to);
                }
            }
        }
    }
}

/**
 * A structure that has been planned but not yet drawn.
 *
 * Planning is separated from drawing because the plan is the part that must not vary: it is worked
 * out from the structure's origin and the world seed alone, and then replayed identically into
 * every chunk the structure covers.
 */
export interface StructurePlan {
    /** Everything the structure will write, for deciding which chunks need to run it. */
    readonly bounds: BoundingBox;

    /** Mobs that belong to this structure, in world coordinates. */
    readonly spawns: readonly EntitySpawn[];

    /**
     * Draws the whole structure; the canvas keeps only the part inside its chunk.
     *
     * The sampler comes along because levelling the ground is drawing, not planning: what a
     * building has to fill in underneath itself depends on the column, and there are far too many
     * columns to have worked them all out in advance.
     */
    draw(canvas: StructureCanvas, terrain: TerrainSampler): void;
}

/** Where a structure starts, in world block coordinates. */
export interface StructureOrigin {
    readonly x: number;
    readonly z: number;
}

/**
 * Something world generation builds that is larger than a chunk.
 *
 * Chunks are generated in isolation and in no particular order, with no access to their
 * neighbours - which is the whole difficulty. A structure gets around it by being a pure function
 * of its origin: any chunk can work out on its own which structures reach it, plan each of them
 * from scratch, and draw the slice it owns. No chunk needs to have been generated first, and
 * generating one twice gives the same result.
 */
export interface Structure {
    /** Used in logs and tests. */
    readonly name: string;

    /** How thinly this structure is spread across the world. */
    readonly placement: StructurePlacement;

    /**
     * How far the structure may reach from its origin, in blocks.
     *
     * An over-estimate is merely wasteful - it makes nearby chunks plan a structure that turns out
     * not to touch them. An under-estimate truncates the structure at a chunk border, so this is
     * the one number here that has to be generous rather than accurate.
     */
    readonly reach: number;

    /**
     * Plans the structure at an origin, or refuses the site.
     * @returns {StructurePlan | null} Null when the terrain will not take it - underwater, too
     * steep - which is the ordinary way a candidate origin comes to nothing.
     */
    plan(origin: StructureOrigin, random: ChunkRandom, terrain: TerrainSampler): StructurePlan | null;
}
