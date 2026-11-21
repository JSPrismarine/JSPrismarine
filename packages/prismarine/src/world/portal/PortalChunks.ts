/**
 * The loaded chunks of one world that may hold a portal block of any kind, so the per-tick
 * portal check skips a body standing in chunks that hold none.
 *
 * Java finds a portal while `Entity.checkInsideBlocks` walks the blocks a body is in, a walk it
 * makes anyway for every block that reacts to being stood in. The world here walks the body
 * cells for portals alone, so without this set every entity reads a dozen or more blocks a
 * tick in a world with no portal in it.
 *
 * The set answers "may hold" rather than "holds": a chunk enters it when one of its palettes
 * names a portal block as it loads, or when a portal block is written into it, and leaves only
 * when it unloads. A portal block that is broken again leaves its chunk in the set, which costs
 * that chunk's bodies the scan they made before and changes no answer. `World` feeds it from the
 * same two places it feeds {@link PortalIndex}: its one block write path and each chunk it
 * loads, which are the only ways a portal block appears in memory.
 */
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from '../chunk/Chunk';
import { isPortalBlock } from './rules';

/** Whether any sub chunk palette of a chunk names a portal block. */
const namesPortalBlock = (chunk: Chunk): boolean => {
    for (const [, subChunk] of chunk.getSubChunkEntries()) {
        const palette = subChunk.getStorages()[0]?.getPalette() ?? [];
        for (const runtimeId of palette) {
            const name = BlockRuntimeIds.getState(runtimeId)?.name;
            if (name !== undefined && isPortalBlock(name)) return true;
        }
    }
    return false;
};

/** The chunks of one world that may hold a portal block. */
export class PortalChunks {
    private readonly chunks = new Set<number>();

    /** Records a chunk entering memory when one of its palettes names a portal block. */
    public chunkLoaded(chunk: Chunk): void {
        if (namesPortalBlock(chunk)) this.chunks.add(Chunk.packXZ(chunk.getX(), chunk.getZ()));
    }

    /** Forgets a chunk leaving memory. */
    public chunkUnloaded(chunk: Chunk): void {
        this.chunks.delete(Chunk.packXZ(chunk.getX(), chunk.getZ()));
    }

    /**
     * Keeps the set in step with one block write.
     * @param x - The block's world x.
     * @param z - The block's world z.
     * @param after - The identifier that stands there now.
     */
    public blockChanged(x: number, z: number, after: string): void {
        if (isPortalBlock(after)) this.chunks.add(Chunk.packXZ(x >> 4, z >> 4));
    }

    /** Whether a portal block may stand in any chunk of a span, inclusive on both axes. */
    public mayHoldAny(minChunkX: number, maxChunkX: number, minChunkZ: number, maxChunkZ: number): boolean {
        if (this.chunks.size === 0) return false;
        for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1)
            for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1)
                if (this.chunks.has(Chunk.packXZ(chunkX, chunkZ))) return true;
        return false;
    }
}
