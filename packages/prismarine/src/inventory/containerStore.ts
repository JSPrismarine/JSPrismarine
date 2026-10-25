/**
 * The slots a block stores, as something an `ItemStackRequest` can move stacks through.
 *
 * Opening a chest already worked before this: `PlayerSession.openBlockContainer` sent the screen
 * and the block's `Items` followed it. Nothing could then move a stack into or out of those
 * slots, because `ItemStackRequestHandler` owned the player's own containers and the two slots a
 * workstation keeps on the open window, and a chest's 27 were neither. This module is the store
 * it was missing.
 *
 * The slots are not copied onto the window. They live where they already live, which for every
 * block but one is the chunk's own block entity, under Bedrock's `Items` list that a vanilla tool
 * reads - so a stack put in a chest is on disk at the next save, spills when the block is broken,
 * and is what the next player to open it is sent. The one exception is the ender chest, whose
 * slots belong to the player and not to the block it was opened from.
 *
 * A request reads the whole container once, moves stacks around in that array, and writes it back
 * when the request is accepted. That is what makes a refusal total - {@link rollBack} throws the
 * array away rather than undoing steps - and it is also what keeps two players at one chest from
 * corrupting each other: each request starts from what is in the block now.
 *
 * What a block entity carries per slot is an identifier and a count, which is all
 * `@jsprismarine/block-behaviors` models and all `blockentity/contentRecord.ts` writes. A stack
 * put into a chest therefore keeps its name and how many there are, and loses its enchantments,
 * its damage and any name an anvil gave it. That is a gap in the record shape rather than in this
 * module.
 */
import { slotsOf, pairedPosition } from '@jsprismarine/block-behaviors';
import type { WorldActions } from '@jsprismarine/block-behaviors';

import ContainerEntry from './ContainerEntry';
import type Inventory from './Inventory';
import { Item } from '../item/Item';
import type Player from '../Player';
import type { BlockEntityData, ContentPosition } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';

/** One slot of a block entity's `Items`, as the record carries it. */
type RecordItem = NonNullable<NonNullable<BlockEntityData['items']>[number]>;

/**
 * The slots one open screen owns, read on first use and written back once.
 *
 * Every member is synchronous, because {@link import('../network/handler/ItemStackRequestHandler')}
 * applies a whole request without awaiting: a refusal has to be able to roll the request back
 * before anything else runs.
 */
export interface OpenContainerSlots {
    /** How many slots the screen shows, which is how many the client was sent. */
    readonly size: number;
    /** What is in one slot, or null when it is empty or out of range. */
    get(slot: number): Item | null;
    /** Puts something in a slot, or empties it. */
    set(slot: number, item: Item | null): void;
    /** Throws away everything this request changed, which is what a refusal does. */
    rollBack(): void;
    /** Writes what changed back where it came from. */
    commit(): void;
}

/** Where a container's slots are kept, which is a block entity for all but the ender chest. */
interface SlotBacking {
    readonly size: number;
    read(): (Item | null)[];
    write(slots: readonly (Item | null)[]): void;
}

/** The stack one record entry names, or null when no loaded pack has such an item. */
const itemOf = (held: RecordItem | undefined, content: ServerContent): Item | null => {
    if (held === undefined) return null;
    if (!content.items.registry.has(held.identifier)) return null;

    return new Item({ name: held.identifier, count: held.count, content });
};

/** One stack as the record carries one, or undefined for an empty slot. */
const recordItemOf = (item: Item | null): RecordItem | undefined => {
    if (item === null || item.getName() === 'minecraft:air' || item.getAmount() <= 0) return undefined;

    return { identifier: item.getName(), count: item.getAmount() };
};

/** An inventory slot's stack, with the empty one reported as empty rather than as air. */
const inventoryItem = (inventory: Inventory, slot: number): Item | null => {
    const item = inventory.getItem(slot);
    return item.getName() === 'minecraft:air' ? null : item;
};

/** The ender chest, which travels with the player rather than with the block they opened. */
const enderChestBacking = (inventory: Inventory): SlotBacking => ({
    size: inventory.getSlotCount(),
    read: () => Array.from({ length: inventory.getSlotCount() }, (_unused, slot) => inventoryItem(inventory, slot)),
    write: (slots) => {
        slots.forEach((item, slot) => {
            if (item === null) inventory.removeItem(slot);
            else inventory.setItem(slot, new ContainerEntry({ item, count: item.getAmount() }));
        });
    }
});

/** The two halves of a double chest, lowest on x and then z first, or the one block on its own. */
const halvesOf = (world: WorldActions, at: ContentPosition, identifier: string): ContentPosition[] => {
    const partner = pairedPosition(world.getBlockData(at));
    if (partner === undefined) return [at];

    // Only a partner that is still the same block. A chest whose other half was replaced while
    // the record still named it would otherwise lend its slots to whatever stands there now.
    if (world.getBlock(partner)?.identifier !== identifier) return [at];

    // One order for both halves, so the player who opened the left chest and the player who
    // opened the right one are looking at the same 54 slots in the same places.
    return at.x !== partner.x
        ? [at.x < partner.x ? at : partner, at.x < partner.x ? partner : at]
        : [at.z < partner.z ? at : partner, at.z < partner.z ? partner : at];
};

/**
 * Whether a block's screen draws slots that belong to the player rather than to the block.
 *
 * The ender chest, and nothing else: two players at one ender chest are looking at two different
 * inventories, so neither one's change is anything the other has to be told about.
 */
export const isPerPlayerContainer = (identifier: string): boolean => identifier.endsWith('ender_chest');

/** A block's own slots, across however many block entities the block spans. */
const blockEntityBacking = (player: Player, at: ContentPosition, identifier: string): SlotBacking | undefined => {
    const content = player.getServer().getContent();
    if (content === undefined) return undefined;

    const world = content.world.blockWorld.at(player.getWorld().getDimension().name);
    const per = slotsOf(identifier);
    const halves = halvesOf(world, at, identifier);

    return {
        size: per * halves.length,
        read: () =>
            halves.flatMap((position) => {
                const items = world.getBlockData(position)?.items ?? [];
                return Array.from({ length: per }, (_unused, slot) => itemOf(items[slot], content));
            }),
        write: (slots) => {
            halves.forEach((position, half) => {
                const data = world.getBlockData(position);
                const items = Array.from({ length: per }, (_unused, slot) =>
                    recordItemOf(slots[half * per + slot] ?? null)
                );
                world.setBlockData(position, { ...data, items, capacity: per });
            });
        }
    };
};

/**
 * The slots the screen a player has open owns, or undefined when it owns none.
 *
 * @param player - Whose screen it is, which decides an ender chest and names the dimension.
 * @param at - The block the screen was opened from.
 * @param identifier - The block standing there, which decides how many slots it has.
 */
export const openContainerSlots = (
    player: Player,
    at: ContentPosition,
    identifier: string
): OpenContainerSlots | undefined => {
    const backing = isPerPlayerContainer(identifier)
        ? enderChestBacking(player.getInventory().getEnderChest())
        : blockEntityBacking(player, at, identifier);

    if (backing === undefined || backing.size === 0) return undefined;

    let slots: (Item | null)[] | undefined;
    let dirty = false;
    const held = (): (Item | null)[] => (slots ??= backing.read());

    return {
        size: backing.size,
        get: (slot) => (slot >= 0 && slot < backing.size ? (held()[slot] ?? null) : null),
        set: (slot, item) => {
            if (slot < 0 || slot >= backing.size) return;
            held()[slot] = item;
            dirty = true;
        },
        rollBack: () => {
            slots = undefined;
            dirty = false;
        },
        commit: () => {
            if (!dirty || slots === undefined) return;
            backing.write(slots);
            dirty = false;
        }
    };
};

/**
 * Which block a screen's slots are filed under, which is not always the block that was clicked.
 *
 * Either half of a double chest opens the same 54 slots, so a caller comparing two open screens
 * has to compare what they hold rather than where they were opened from. The answer is the half
 * the slots are ordered from, which is the one {@link openContainerSlots} reads first.
 */
export const containerAnchorOf = (player: Player, at: ContentPosition, identifier: string): ContentPosition => {
    const content = player.getServer().getContent();
    if (content === undefined || isPerPlayerContainer(identifier)) return at;

    const world = content.world.blockWorld.at(player.getWorld().getDimension().name);
    return halvesOf(world, at, identifier)[0] ?? at;
};

/**
 * What a block is holding, one entry per slot, for the `InventoryContent` that follows an open.
 *
 * The same read the request path uses, so the slots a player is shown and the slots they can
 * then move a stack through are the same slots in the same order. A double chest is 54 entries
 * here for the same reason.
 */
export const openContainerContents = (player: Player, at: ContentPosition, identifier: string): ContainerEntry[] => {
    const slots = openContainerSlots(player, at, identifier);
    if (slots === undefined) return [];

    return Array.from({ length: slots.size }, (_unused, slot) => {
        const item = slots.get(slot);
        return item === null
            ? new ContainerEntry({ item: Item.air() })
            : new ContainerEntry({ item, count: item.getAmount() });
    });
};
