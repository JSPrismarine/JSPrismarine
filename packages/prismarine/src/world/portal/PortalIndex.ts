/**
 * Every lit nether portal block in one world, so a trip searches a set rather than a
 * 256 by 256 by 128 block volume.
 *
 * Java keeps the same thing as the `nether_portal` point of interest in `PoiManager`;
 * Dragonfly scans blocks and pays for it. `World` feeds the index from its one block write
 * path and from each chunk it loads, which are the only two ways a portal block appears or
 * disappears in memory.
 */
import { isNetherPortal } from '@jsprismarine/block-behaviors';
import type { BlockPosition } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type Chunk from '../chunk/Chunk';

/** The side of a sub chunk, in blocks. */
const SUB_CHUNK_SIDE = 16;

const keyOf = (at: BlockPosition): string => `${at.x},${at.y},${at.z}`;

/** The portal blocks of one world, by position. */
export class PortalIndex {
    private readonly blocks = new Map<string, Vector3>();

    /** Records a portal block. Recording one twice is one entry. */
    public add(at: BlockPosition): void {
        this.blocks.set(keyOf(at), new Vector3(at.x, at.y, at.z));
    }

    /** Forgets a portal block. Forgetting one the index never held does nothing. */
    public remove(at: BlockPosition): void {
        this.blocks.delete(keyOf(at));
    }

    /** Whether the index holds a portal block at a position. */
    public has(at: BlockPosition): boolean {
        return this.blocks.has(keyOf(at));
    }

    /** How many portal blocks the index holds. */
    public get size(): number {
        return this.blocks.size;
    }

    /**
     * The portal block nearest a position, as Java's `PortalForcer.findClosestPortalPosition`
     * picks one.
     *
     * Candidates lie within `radius` on x and z, which is the square of columns
     * `PoiManager.getInSquare` walks; y is unbounded, since Java reads whole columns. The
     * winner is the least squared Euclidean distance including y, and the lower block when
     * two tie, which is Java's `thenComparingInt(Vec3i::getY)`.
     *
     * @param radius - In blocks, inclusive. Zero finds a portal block in the column of `to`
     *   and nothing else.
     * @returns The nearest portal block, or undefined when none is within the radius.
     */
    public closest(to: Vector3, radius: number): Vector3 | undefined {
        let best: Vector3 | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of this.blocks.values()) {
            const dx = candidate.getX() - to.getX();
            const dy = candidate.getY() - to.getY();
            const dz = candidate.getZ() - to.getZ();
            if (Math.abs(dx) > radius || Math.abs(dz) > radius) continue;

            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < bestDistance || (distance === bestDistance && best && candidate.getY() < best.getY())) {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best;
    }

    /**
     * Keeps the index in step with one block write.
     *
     * @param before - The identifier that stood at the position.
     * @param after - The identifier that stands there now.
     */
    public blockChanged(at: BlockPosition, before: string, after: string): void {
        const was = isNetherPortal(before);
        const is = isNetherPortal(after);
        if (is && !was) this.add(at);
        else if (was && !is) this.remove(at);
    }

    /**
     * Forgets every portal block inside a chunk that is leaving memory.
     *
     * A trip must not land in a portal the world cannot read; the chunk's blocks come back
     * into the index through {@link PortalIndex.chunkLoaded} when it is read again.
     */
    public chunkUnloaded(chunk: Chunk): void {
        for (const [key, at] of this.blocks) {
            if (at.getX() >> 4 === chunk.getX() && at.getZ() >> 4 === chunk.getZ()) this.blocks.delete(key);
        }
    }

    /**
     * Records every portal block a freshly loaded chunk holds.
     *
     * A sub chunk whose palette names no portal block is skipped without reading its blocks,
     * which is nearly every sub chunk in a world.
     */
    public chunkLoaded(chunk: Chunk): void {
        const originX = chunk.getX() * SUB_CHUNK_SIDE;
        const originZ = chunk.getZ() * SUB_CHUNK_SIDE;
        for (const [index, subChunk] of chunk.getSubChunks()) {
            const storage = subChunk.getStorages()[0];
            if (storage === undefined) continue;

            const portalSlots = new Set<number>();
            storage.getPalette().forEach((runtimeId, slot) => {
                const name = BlockRuntimeIds.getState(runtimeId)?.name;
                if (name !== undefined && isNetherPortal(name)) portalSlots.add(slot);
            });
            if (portalSlots.size === 0) continue;

            const originY = index * SUB_CHUNK_SIDE;
            for (let bx = 0; bx < SUB_CHUNK_SIDE; bx += 1) {
                for (let bz = 0; bz < SUB_CHUNK_SIDE; bz += 1) {
                    for (let by = 0; by < SUB_CHUNK_SIDE; by += 1) {
                        if (!portalSlots.has(storage.getPaletteIndexAt(bx, by, bz))) continue;
                        this.add({ x: originX + bx, y: originY + by, z: originZ + bz });
                    }
                }
            }
        }
    }
}
