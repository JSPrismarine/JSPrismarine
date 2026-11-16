/**
 * A hopper minecart collecting the items around it, transcribed from Java's
 * `MinecartHopper.suckInItems`.
 *
 * Each tick an enabled hopper minecart takes from the first item entity in reach that fits:
 * `HopperBlockEntity.suckInItems` reads the hopper's suck box, a block across from 11/16 of a
 * block above the cart's `getLevelY` (its y plus a half) up to two blocks, and then the cart reads
 * its own box grown by a quarter block sideways. `HopperBlockEntity.addItem` moves as much of the
 * stack as the container's slots take, slot by slot, and the call ends after the first item entity
 * that moved, so a cart takes one stack a tick. Bedrock's `minecraft:item_hopper` marks the cart
 * that does this.
 */
import type { ContentItemDrop, ContentPosition } from '../../content/world/adapter';
import { sameDrop } from '../equipment';

/** The component that marks a collecting hopper minecart. */
export const ITEM_HOPPER = 'minecraft:item_hopper';

/** `Hopper.SUCK_AABB`'s bottom, in blocks above the hopper's own block. */
const SUCK_BOTTOM = 11 / 16;

/** `Hopper.SUCK_AABB`'s top, in blocks above the hopper's own block. */
const SUCK_TOP = 2;

/** `MinecartHopper.getLevelY` sits this far above the cart's y. */
const LEVEL_Y_OFFSET = 0.5;

/** How far `MinecartHopper.suckInItems` grows the cart's box sideways. */
const SIDEWAYS_REACH = 0.25;

/** Half the width of an item entity's box, which `EntityType.ITEM` sizes at 0.25. */
const ITEM_HALF_WIDTH = 0.125;

/** The height of an item entity's box. */
const ITEM_HEIGHT = 0.25;

/** The furthest an item a cart reaches can lie from its position, for an index query. */
export const ITEM_HOPPER_QUERY_RADIUS = SUCK_TOP + LEVEL_Y_OFFSET + 1;

/** A hopper minecart's position and box, as the reach test reads them. */
export interface HopperCart {
    readonly position: ContentPosition;
    readonly width: number;
    readonly height: number;
}

const overlaps = (low: number, high: number, otherLow: number, otherHigh: number): boolean =>
    low < otherHigh && otherLow < high;

/** Whether an item entity lying at `item` is in one of the two areas a hopper minecart takes from. */
export const inHopperReach = (cart: HopperCart, item: ContentPosition): boolean => {
    const { x, y, z } = cart.position;
    const itemX = [item.x - ITEM_HALF_WIDTH, item.x + ITEM_HALF_WIDTH] as const;
    const itemY = [item.y, item.y + ITEM_HEIGHT] as const;
    const itemZ = [item.z - ITEM_HALF_WIDTH, item.z + ITEM_HALF_WIDTH] as const;

    // The suck box: a block across, centered on the cart, moved to its level y less a half.
    const levelBase = y + LEVEL_Y_OFFSET - 0.5;
    const inSuckBox =
        overlaps(x - 0.5, x + 0.5, ...itemX) &&
        overlaps(levelBase + SUCK_BOTTOM, levelBase + SUCK_TOP, ...itemY) &&
        overlaps(z - 0.5, z + 0.5, ...itemZ);
    if (inSuckBox) return true;

    const half = cart.width / 2 + SIDEWAYS_REACH;
    return (
        overlaps(x - half, x + half, ...itemX) &&
        overlaps(y, y + cart.height, ...itemY) &&
        overlaps(z - half, z + half, ...itemZ)
    );
};

/**
 * Puts as much of a stack into a container as its slots take, slot by slot as
 * `HopperBlockEntity.addItem` does: an empty slot takes up to a full stack, and a slot holding the
 * same item in the same condition tops up to one.
 * @param slots - The container's slots.
 * @param capacity - How many slots it has.
 * @param item - The stack to put in.
 * @param maxStack - The item's maximum stack size.
 * @returns The slots afterwards and how many items went in.
 */
export const insertStack = (
    slots: readonly (ContentItemDrop | undefined)[],
    capacity: number,
    item: ContentItemDrop,
    maxStack: number
): { readonly slots: readonly (ContentItemDrop | undefined)[]; readonly inserted: number } => {
    const next = Array.from({ length: Math.max(capacity, slots.length) }, (_, index) => slots[index]);
    let remaining = item.count;
    for (let index = 0; index < capacity && remaining > 0; index += 1) {
        const held = next[index];
        if (held === undefined) {
            const moved = Math.min(remaining, maxStack);
            next[index] = { ...item, count: moved };
            remaining -= moved;
        } else if (held.count < maxStack && sameDrop({ ...held, count: 1 }, { ...item, count: 1 })) {
            const moved = Math.min(remaining, maxStack - held.count);
            next[index] = { ...held, count: held.count + moved };
            remaining -= moved;
        }
    }
    return { slots: next, inserted: item.count - remaining };
};
