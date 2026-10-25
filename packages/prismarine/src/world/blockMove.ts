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

import { writeBlockEntity } from '../blockentity/blockEntityWrite';
import type { BlockEntityWorld } from '../blockentity/blockEntityWrite';
import type { ContentPosition } from '../content/world/adapter';

export type { BlockEntityWorld };

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
        // A block entity is filed under the position it says it is at, so the position has
        // to be rewritten before it is written or it would land back where it came from.
        // `writeBlockEntity` files it there and tells the clients holding that chunk, which
        // is what makes a pushed chest arrive with its contents on the screen as well as on
        // the server.
        carried.addValue('x', new Types.NumberVal(to.x));
        carried.addValue('y', new Types.NumberVal(to.y));
        carried.addValue('z', new Types.NumberVal(to.z));
        writeBlockEntity(world, carried);
    };
};
