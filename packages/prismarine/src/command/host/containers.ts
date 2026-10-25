/**
 * The container a command addresses by position.
 *
 * `inventory/containerStore.ts` answers the same question for the screen a
 * player has open, and it needs that player: an ender chest's slots belong to
 * them rather than to the block, and the dimension is read off their world. A
 * command has neither. `/loot insert ~ ~-1 ~` typed at the console still has
 * to reach the chest standing there, so this reads the same block entity
 * record through the same `blockWorld` seam and leaves the screen out of it.
 *
 * One block entity, not one screen. The half of a double chest a command names
 * is the half it writes, which is how Bedrock addresses one: `slot.container
 * 26` is the last slot of that block, not the twenty-seventh of fifty-four.
 *
 * Nothing here is sent to a client. A player standing at an open chest while a
 * command writes into it keeps the window they were sent until they close it,
 * which is the same thing that happens when a hopper fills the chest.
 */
import { maxStackSize } from '@jsprismarine/items';
import type { Vector3 } from '@jsprismarine/math';

import type Server from '../../Server';
import type { ContentItemDrop, ContentPosition } from '../../content/world/adapter';
import type { ServerContent } from '../../content/ServerContent';
import { blockContainerOf } from '../../inventory/blockContainers';
import type { World } from '../../world/World';

/**
 * The slots one block stores, read once and written back once.
 *
 * Synchronous throughout, because a command body decides what it did before it
 * returns the count `execute store result` captures.
 */
export interface BlockContainerSlots {
    /** How many slots the block stores. */
    readonly size: number;
    /** What is in one slot, or undefined when it is empty. */
    get(slot: number): ContentItemDrop | undefined;
    /** Puts a stack in a slot, or empties it. Out-of-range slots are ignored. */
    set(slot: number, drop: ContentItemDrop | undefined): void;
    /** Writes every change back into the chunk's block entity. */
    commit(): void;
}

/**
 * The container standing at a position.
 *
 * @param world - The world the position is in, which also names the dimension.
 * @returns The slots, or undefined when the content build is off, the chunk is
 *   not in memory, or the block stores nothing of its own. The last case
 *   covers a workstation: a crafting table and a grindstone draw slots that
 *   live in the player's own window, so there is nothing at that position for
 *   a command to write into.
 */
export const blockContainerAt = (server: Server, world: World, at: Vector3): BlockContainerSlots | undefined => {
    const content = server.getContent();
    if (content === undefined) return undefined;

    const block = world.loadedBlockAt(at.getX(), at.getY(), at.getZ());
    if (block === undefined) return undefined;

    const size = blockContainerOf(block.name)?.slots ?? 0;
    if (size === 0) return undefined;

    const actions = content.world.blockWorld.at(world.getDimension().name);
    const position: ContentPosition = { x: at.getX(), y: at.getY(), z: at.getZ() };
    const data = actions.getBlockData(position);
    const held = Array.from({ length: size }, (_unused, slot) => data?.items?.[slot]);

    return {
        size,
        get: (slot) => held[slot],
        set: (slot, drop) => {
            if (slot >= 0 && slot < size) held[slot] = drop;
        },
        // `capacity` goes with the items, because a comparator divides by it
        // and a record that states a shorter one reads as a fuller container.
        commit: () => actions.setBlockData(position, { ...data, items: held, capacity: size })
    };
};

/** How many of one item fit in a slot, which an item definition may lower to 1 or 16. */
const stackLimitOf = (content: ServerContent, identifier: string): number =>
    content.items.types.get(identifier)?.params(maxStackSize) ?? DEFAULT_MAX_STACK_SIZE;

/** What an item that declares no `minecraft:max_stack_size` stacks to, which is Java's default. */
const DEFAULT_MAX_STACK_SIZE = 64;

/**
 * Whether two stacks are the same thing, so one may grow into the other.
 *
 * Java's `ItemStack.isSameItemSameComponents`, as far as a record carries: an
 * enchanted pickaxe does not merge with a plain one, and a shulker box holding
 * something does not merge with an empty one.
 */
const mergeable = (held: ContentItemDrop, drop: ContentItemDrop): boolean =>
    held.identifier === drop.identifier &&
    (held.meta ?? 0) === (drop.meta ?? 0) &&
    (held.damage ?? 0) === (drop.damage ?? 0) &&
    held.customName === drop.customName &&
    held.contents === undefined &&
    drop.contents === undefined &&
    held.lore === undefined &&
    drop.lore === undefined &&
    held.enchantments === undefined &&
    drop.enchantments === undefined;

/**
 * Puts stacks into a container, growing matching stacks before taking an empty
 * slot.
 *
 * Java's `LootCommand.insertIntoContainer`, step for step, because the steps
 * are what decide the answer: a stack that half fits leaves the rest behind
 * rather than being refused whole, and that remainder is what the reported
 * count leaves out.
 *
 * The caller still has to {@link BlockContainerSlots.commit}, so a command
 * that decides to refuse writes nothing.
 *
 * @returns How many items went in, which is zero when the container was full.
 */
export const insertIntoContainer = (
    container: BlockContainerSlots,
    content: ServerContent,
    drops: readonly ContentItemDrop[]
): number => {
    let inserted = 0;

    for (const drop of drops) {
        let left = drop.count;
        const limit = stackLimitOf(content, drop.identifier);

        for (let slot = 0; slot < container.size && left > 0; slot += 1) {
            const held = container.get(slot);
            if (held === undefined) {
                container.set(slot, { ...drop, count: left });
                inserted += left;
                left = 0;
                break;
            }

            if (!mergeable(held, drop)) continue;

            const room = Math.min(limit - held.count, left);
            if (room <= 0) continue;

            container.set(slot, { ...held, count: held.count + room });
            inserted += room;
            left -= room;
        }
    }

    return inserted;
};
