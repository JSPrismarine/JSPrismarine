/**
 * Carrying a block entity from one position to another.
 *
 * A block write clears the block entity standing at the position, which is right for every
 * write but one: a piston push is a move rather than a break and a place, and the chest it
 * pushed is meant to arrive with what it was holding. Writing the two blocks separately
 * loses it, which is the bug this module exists to make impossible.
 *
 * The block entity travels as the NBT compound it serializes to and is rebuilt at the new
 * position, so nothing it carries is dropped on the way, including the tags this server has
 * no model for. {@link import('../blockentity/BlockEntity').BlockEntity} explains why that
 * matters.
 */
import { Types } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';

import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import type { BlockEntity } from '../blockentity/BlockEntity';
import type { ContentPosition } from '../content/world/adapter';

/** A chunk as a block entity move reads and writes one. */
interface BlockEntityChunk {
    getBlockEntity(x: number, y: number, z: number): { toNBT(): NBTTagCompound } | null;
    setBlockEntity(blockEntity: BlockEntity): void;
}

/** The little of a world {@link takeBlockEntity} reads: the chunks, synchronously. */
export interface BlockEntityWorld {
    /** The chunk holding a column, or null when it is not in memory. */
    getLoadedChunk(x: number, z: number): BlockEntityChunk | null;
}

/** Files a block entity that has been taken off a position at a new one. */
export type PlaceBlockEntity = (to: ContentPosition) => void;

/**
 * Takes the block entity off a position so it can be filed at another one.
 *
 * Read before the write that empties the position, because the write is what clears it.
 *
 * @returns A function that files it at a new position, or undefined when the position
 *   carried no block entity and there is nothing to carry.
 */
export const takeBlockEntity = (world: BlockEntityWorld, at: ContentPosition): PlaceBlockEntity | undefined => {
    const standing = world.getLoadedChunk(at.x >> 4, at.z >> 4)?.getBlockEntity(at.x, at.y, at.z);
    if (standing === null || standing === undefined) return undefined;

    const carried = standing.toNBT();

    return (to) => {
        const chunk = world.getLoadedChunk(to.x >> 4, to.z >> 4);
        if (chunk === null) return;

        // A block entity is filed under the position it says it is at, so the position has
        // to be rewritten before it is rebuilt or it would land back where it came from.
        carried.addValue('x', new Types.NumberVal(to.x));
        carried.addValue('y', new Types.NumberVal(to.y));
        carried.addValue('z', new Types.NumberVal(to.z));
        chunk.setBlockEntity(BlockEntityRegistry.fromNBT(carried));
    };
};
