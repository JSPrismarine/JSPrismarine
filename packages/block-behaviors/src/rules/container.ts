/**
 * Container block entities and the signal a comparator reads out of one.
 *
 * The inventory itself belongs to the item runtime, so a container behavior
 * keeps only what a block decides: how many slots it has, whether a player
 * has it open, and the fill level the comparator behind it measures.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import type { BlockEntityData, ItemDrop, WorldActions } from '../world';
import { MAX_POWER } from './redstone';

/** How many of one item a slot holds, which the fill-level formula divides by. */
export const MAX_STACK_SIZE = 64;

/** How many slots each kind of container has. */
export const CONTAINER_SLOTS: Readonly<Record<string, number>> = {
    chest: 27,
    trapped_chest: 27,
    ender_chest: 27,
    barrel: 27,
    shulker_box: 27,
    undyed_shulker_box: 27,
    dispenser: 9,
    dropper: 9,
    crafter: 9,
    hopper: 5,
    furnace: 3,
    blast_furnace: 3,
    smoker: 3,
    brewing_stand: 5,
    decorated_pot: 1,
    chiseled_bookshelf: 6,
    lectern: 1,
    jukebox: 1,
    campfire: 4,
    soul_campfire: 4
};

/** The slot count for a block, with 27 for an unlisted container. */
export const slotsOf = (identifier: string): number => {
    const name = identifier.replace(/^[^:]*:/, '');
    const kind = name.endsWith('shulker_box') ? 'shulker_box' : name;
    return CONTAINER_SLOTS[kind] ?? 27;
};

/** Creates the block entity a container starts with. */
export const emptyContainer = (identifier: string): BlockEntityData => ({
    items: new Array<ItemDrop | undefined>(slotsOf(identifier)).fill(undefined),
    capacity: slotsOf(identifier)
});

/**
 * The comparator signal a container puts out.
 *
 * Java's formula: the average fullness over every slot, scaled onto 1 to 15,
 * with 0 only for an empty container.
 */
export const containerSignal = (data: BlockEntityData | undefined): number => {
    const items = data?.items ?? [];
    const capacity = data?.capacity ?? items.length;
    if (capacity === 0) return 0;

    let fullness = 0;
    for (const item of items) {
        if (item === undefined) continue;
        fullness += item.count / MAX_STACK_SIZE;
    }
    if (fullness === 0) return 0;
    return Math.min(MAX_POWER, Math.floor((fullness / capacity) * (MAX_POWER - 1)) + 1);
};

/** Drops everything a container holds, which is what breaking one does. */
export const spillContainer = (world: WorldActions, block: HookBlock): void => {
    const data = world.getBlockData(block.position);
    for (const item of data?.items ?? []) {
        if (item !== undefined) world.dropItem(block.position, item);
    }
};
