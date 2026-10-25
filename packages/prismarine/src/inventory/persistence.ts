/**
 * What a player is carrying, in the plain form a player data record holds it in.
 *
 * Nothing persisted a player's items before this module: `WorldPlayerData` carried a position,
 * a gamemode and the advancement progress, so every stack a player held was lost on logout
 * along with its enchantments, its durability and its name.
 *
 * The shape here is deliberately plain data rather than `Item` and `ContainerEntry`. A provider
 * decides how to store it - the LevelDB provider writes Bedrock's own `Inventory`, `Armor`,
 * `Offhand` and `EnderChestInventory` lists, the JSON fallback writes it as it stands - and
 * neither should have to know how an inventory is built. An empty slot is `null` and not
 * `undefined` for the same reason: `JSON.stringify` turns an `undefined` array element into
 * `null` anyway, so the two forms would not match across the fallback path.
 */
import type { ItemDrop } from '@jsprismarine/block-behaviors';

import ContainerEntry from './ContainerEntry';
import type HumanInventory from './HumanInventory';
import type Inventory from './Inventory';
import { Item } from '../item/Item';
import type { ServerContent } from '../content/ServerContent';

/** What an empty slot holds, and so the name a stored slot never carries. */
const AIR = 'minecraft:air';

/** One stack as a player data record holds it. */
export interface StoredItemStack {
    /** The item identifier, namespaced. */
    readonly name: string;
    readonly count: number;
    /** The aux value, which is Bedrock's top-level `Damage`. */
    readonly meta?: number;
    /**
     * Durability spent, which is Java's `minecraft:damage` and Bedrock's `tag.Damage`.
     *
     * Spent rather than remaining, so a stack of an item whose maximum durability changed
     * between versions comes back as damaged by the same amount instead of as a different
     * fraction of a different total.
     */
    readonly damage?: number;
    readonly customName?: string;
    readonly lore?: readonly string[];
    /** Namespaced Java enchantment id to level, which is `minecraft:enchantments`. */
    readonly enchantments?: Readonly<Record<string, number>>;
    /**
     * What a container item holds, one entry per slot, which is a shulker box's inventory.
     *
     * Null for an empty slot rather than undefined, for the reason the module comment gives:
     * `JSON.stringify` turns an undefined array element into null, so the two forms would not
     * match across the fallback path.
     */
    readonly contents?: readonly (StoredItemStack | null)[];
}

/**
 * The same stack as a block behavior carries one.
 *
 * {@link ItemDrop} and {@link StoredItemStack} describe the same thing and differ in one
 * name: a drop calls the item `identifier` and a stored stack calls it `name`. Neither can
 * be renamed - the drop's spelling is `@jsprismarine/block-behaviors`' published interface,
 * and the stored one's is in every player file already written - so the rename happens here,
 * once, for both directions.
 */
export const itemDropOf = (stored: StoredItemStack): ItemDrop => {
    const { name, contents, ...rest } = stored;
    return {
        identifier: name,
        ...rest,
        ...(contents === undefined
            ? {}
            : { contents: contents.map((slot) => (slot === null ? undefined : itemDropOf(slot))) })
    };
};

/** The same drop as a player data record stores one, which is {@link itemDropOf} backwards. */
export const storedItemDrop = (drop: ItemDrop): StoredItemStack => {
    const { identifier, contents, ...rest } = drop;
    return {
        name: identifier,
        ...rest,
        ...(contents === undefined ? {} : { contents: contents.map((slot) => (slot ? storedItemDrop(slot) : null)) })
    };
};

/** Every container a player carries, by the slot numbering each one uses. */
export interface StoredInventory {
    /** The 36 main slots; the first nine are the hotbar. */
    readonly items: readonly (StoredItemStack | null)[];
    /** Which hotbar slot the hand points at. */
    readonly handSlot: number;
    /** Helmet, chestplate, leggings, boots. */
    readonly armor: readonly (StoredItemStack | null)[];
    /** One slot. */
    readonly offhand: readonly (StoredItemStack | null)[];
    /** The player's own 27 ender chest slots. */
    readonly enderChest: readonly (StoredItemStack | null)[];
}

/**
 * One slot as a record holds it, or null for an empty one.
 *
 * The count comes off the entry when it has one and off the stack otherwise. The two are kept
 * in step by everything that writes a slot, and an entry built with no count at all holds a
 * zero that would store a full stack as empty.
 */
export const storedStack = (entry: ContainerEntry | null): StoredItemStack | null => {
    const item = entry?.toItemStack();
    if (item === undefined) return null;

    // The count comes off the entry when it has one and off the stack otherwise.
    return storedItem(item, entry?.getCount() || item.getAmount());
};

/**
 * One stack as a record holds it, or null when there is nothing there to store.
 *
 * @param count - How many, which the caller supplies because a slot's count can live on the
 *   entry holding the stack rather than on the stack.
 */
export const storedItem = (item: Item, count: number = item.getAmount()): StoredItemStack | null => {
    if (item.getName() === AIR || count <= 0) return null;

    const enchantments = item.getEnchantments();
    const lore = item.getLore();
    const customName = item.getCustomName();
    const damage = Math.max(0, item.getMaxDurability() - item.getDurability());
    const contents = item.getContents();

    return {
        name: item.getName(),
        count,
        ...(item.getMeta() === 0 ? {} : { meta: item.getMeta() }),
        ...(damage === 0 ? {} : { damage }),
        ...(customName === undefined ? {} : { customName }),
        ...(lore.length === 0 ? {} : { lore: [...lore] }),
        ...(enchantments.size === 0 ? {} : { enchantments: Object.fromEntries(enchantments) }),
        ...(contents.length === 0 ? {} : { contents: contents.map((slot) => (slot ? storedItem(slot) : null)) })
    };
};

/**
 * One stored slot back as an inventory entry, or null when the slot was empty.
 *
 * @param content - The content build, so a pack that redefines an item decides its maximum
 *   durability rather than Java's committed table doing it.
 */
export const restoredStack = (
    stored: StoredItemStack | null | undefined,
    content?: ServerContent
): ContainerEntry | null => {
    const item = restoredItem(stored, content);
    return item === null ? null : new ContainerEntry({ item, count: item.getAmount() });
};

/**
 * One stored stack back as an item, or null when the record held nothing.
 *
 * @param content - The content build, which decides the item's maximum durability.
 */
export const restoredItem = (stored: StoredItemStack | null | undefined, content?: ServerContent): Item | null => {
    if (!stored || stored.name === AIR || stored.count <= 0) return null;

    const item = new Item({
        name: stored.name,
        meta: stored.meta ?? 0,
        count: stored.count,
        content,
        enchantments: stored.enchantments,
        customName: stored.customName,
        lore: stored.lore,
        ...(stored.contents === undefined
            ? {}
            : { contents: stored.contents.map((slot) => restoredItem(slot, content)) })
    });

    // After construction, because the constructor fills durability from the item's maximum and
    // the record stores what was spent off that maximum.
    item.durability = Math.max(0, item.getMaxDurability() - (stored.damage ?? 0));

    return item;
};

/**
 * A block behavior's drop as the item stack it names, or null when the drop is empty.
 *
 * @param content - The content build, which decides the item's maximum durability.
 */
export const itemOfDrop = (drop: ItemDrop, content?: ServerContent): Item | null =>
    restoredItem(storedItemDrop(drop), content);

/** Every slot of one container, empty ones included, so a slot index is its position. */
const storedSlots = (inventory: Inventory): (StoredItemStack | null)[] => {
    const slots: (StoredItemStack | null)[] = [];
    for (let slot = 0; slot < inventory.getSlotCount(); slot += 1) slots.push(storedStack(inventory.getEntry(slot)));
    return slots;
};

/**
 * Puts stored slots back into a container, clearing the ones the record leaves empty.
 *
 * Clearing matters: this runs on a freshly built inventory today, and would silently merge two
 * players' items if it ever ran on one that already held something.
 */
const restoreSlots = (
    inventory: Inventory,
    slots: readonly (StoredItemStack | null)[] | undefined,
    content?: ServerContent
): void => {
    if (slots === undefined) return;

    for (let slot = 0; slot < inventory.getSlotCount(); slot += 1) {
        const entry = restoredStack(slots[slot], content);
        if (entry === null) inventory.removeItem(slot);
        else inventory.setItem(slot, entry);
    }
};

/** Everything a player carries, ready to be written to a player data record. */
export const storedInventory = (inventory: HumanInventory): StoredInventory => ({
    items: storedSlots(inventory),
    handSlot: inventory.getHandSlotIndex(),
    armor: storedSlots(inventory.getArmor()),
    offhand: storedSlots(inventory.getOffhand()),
    enderChest: storedSlots(inventory.getEnderChest())
});

/** Puts a stored record back into a player's containers. */
export const restoreInventory = (
    inventory: HumanInventory,
    stored: StoredInventory | undefined,
    content?: ServerContent
): void => {
    if (stored === undefined) return;

    restoreSlots(inventory, stored.items, content);
    restoreSlots(inventory.getArmor(), stored.armor, content);
    restoreSlots(inventory.getOffhand(), stored.offhand, content);
    restoreSlots(inventory.getEnderChest(), stored.enderChest, content);
    inventory.setHandSlot(stored.handSlot);
};
