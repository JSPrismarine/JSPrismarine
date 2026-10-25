/**
 * One item stack against Bedrock's own item compound.
 *
 * Two places store stacks: a player data record, through
 * `world/providers/leveldb/PlayerCodec.ts`, and a container block entity, through
 * `blockentity/contentRecord.ts`. Both write Bedrock's shape - `Name`, `Count`, the aux value
 * as the top-level `Damage`, `Slot`, and a `tag` compound for the rest - so a vanilla tool and
 * the game itself read what this server wrote. They used to write it twice, and the block
 * entity's copy wrote only the name and the count, which is why a chest gave back a plain
 * pickaxe for an enchanted one.
 *
 * Inside `tag`: the durability spent as `Damage`, the display name and lore under `display`,
 * the enchantments as `ench`, and a container item's own inventory as a nested `Items` list,
 * which is where Bedrock keeps what a shulker box holds.
 *
 * The enchantments go out twice on purpose. `ench` carries the Bedrock numbers the client and
 * a vanilla tool read, and that table covers 37 of the 43 Java enchantments and none of a
 * datapack's, so the Java ids are written beside it under {@link ENCHANTMENTS_TAG} and read
 * back from there first. Without the second copy a Sweeping Edge sword comes back unenchanted.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { bedrockEnchantType, javaEnchantmentId } from '../enchantment/bedrockIds';
import type { StoredItemStack } from './persistence';

/** Bedrock's own list tag for the stacks a container holds. */
export const ITEMS_TAG = 'Items';

/** The Java enchantment ids, under the stack's `tag`, beside Bedrock's own `ench` list. */
export const ENCHANTMENTS_TAG = 'jsprismarine:enchantments';

/** One filled slot of a container, as a list tag carries it. */
export interface NbtItemSlot {
    /** Which slot it sits in, out of the compound's own `Slot` tag. */
    readonly slot: number;
    readonly stack: StoredItemStack;
}

const stringList = (values: readonly string[]): Set<Types.StringVal> =>
    new Set(values.map((value) => new Types.StringVal(value)));

/** Every compound in a list tag, skipping whatever else somebody wrote into it. */
const compoundsIn = (nbt: NBTTagCompound, name: string): NBTTagCompound[] => {
    const values = nbt.getList(name, false);
    if (values === null) return [];

    const compounds: NBTTagCompound[] = [];
    for (const value of values) if (value instanceof NBTTagCompound) compounds.push(value);
    return compounds;
};

/** Every string in a list tag, which is how `display.Lore` is written. */
const stringsIn = (nbt: NBTTagCompound, name: string): string[] => {
    const values = nbt.getList(name, false);
    return values ? Array.from(values, (value) => String(value?.getValue?.() ?? value ?? '')) : [];
};

/** The enchantments on a stack, from the Java ids when they are there and `ench` otherwise. */
const enchantmentsFromNbt = (tag: NBTTagCompound | null): Record<string, number> | undefined => {
    const javaIds = tag?.getCompound(ENCHANTMENTS_TAG, false) ?? null;
    if (javaIds !== null) {
        const levels: Record<string, number> = {};
        for (const [id, value] of javaIds.children) levels[id] = Number(value?.getValue?.() ?? 0);
        if (Object.keys(levels).length > 0) return levels;
    }

    // A record written by the game itself, or by any other Bedrock tool. The numbers resolve
    // through the same table that wrote them, read backwards.
    const levels: Record<string, number> = {};
    for (const instance of tag === null ? [] : compoundsIn(tag, 'ench')) {
        const id = javaEnchantmentId(instance.getShort('id', -1));
        if (id === undefined) continue;
        levels[id] = instance.getShort('lvl', 1);
    }

    return Object.keys(levels).length > 0 ? levels : undefined;
};

/** Writes both copies of a stack's enchantments into its `tag`. */
const enchantmentsToNbt = (tag: NBTTagCompound, levels: readonly (readonly [string, number])[]): void => {
    const ench = new Set<NBTTagCompound>();
    for (const [id, level] of levels) {
        const type = bedrockEnchantType(id);
        // Nothing to write for an enchantment the client's registry does not list. The Java
        // ids below carry it instead, which is what makes the round trip total.
        if (type === undefined) continue;

        const instance = new NBTTagCompound('');
        instance.addValue('id', new Types.ShortVal(type));
        instance.addValue('lvl', new Types.ShortVal(level));
        ench.add(instance);
    }
    if (ench.size > 0) tag.addValue('ench', ench);

    const javaIds = new NBTTagCompound(ENCHANTMENTS_TAG);
    for (const [id, level] of levels) javaIds.addValue(id, new Types.NumberVal(level));
    tag.addChild(javaIds);
};

/**
 * One stack as Bedrock's item compound.
 *
 * @param slot - The slot it sits in, or undefined for a stack nothing numbers, such as the
 *   one a `minecraft:container` entry carries.
 */
export const itemStackToNbt = (stack: StoredItemStack, slot?: number): NBTTagCompound => {
    const entry = new NBTTagCompound('');
    entry.addValue('Name', new Types.StringVal(stack.name));
    entry.addValue('Count', new Types.ByteVal(stack.count));
    entry.addValue('Damage', new Types.ShortVal(stack.meta ?? 0));
    if (slot !== undefined) entry.addValue('Slot', new Types.ByteVal(slot));

    const tag = new NBTTagCompound('tag');
    let anything = false;

    if (stack.damage !== undefined && stack.damage > 0) {
        tag.addValue('Damage', new Types.NumberVal(stack.damage));
        anything = true;
    }

    if (stack.customName !== undefined || (stack.lore?.length ?? 0) > 0) {
        const display = new NBTTagCompound('display');
        if (stack.customName !== undefined) display.addValue('Name', new Types.StringVal(stack.customName));
        if (stack.lore && stack.lore.length > 0) display.addValue('Lore', stringList(stack.lore));
        tag.addChild(display);
        anything = true;
    }

    const levels = Object.entries(stack.enchantments ?? {});
    if (levels.length > 0) {
        enchantmentsToNbt(tag, levels);
        anything = true;
    }

    const contents = itemSlotsToNbt(stack.contents ?? []);
    if (contents.size > 0) {
        tag.addValue(ITEMS_TAG, contents);
        anything = true;
    }

    if (anything) entry.addChild(tag);
    return entry;
};

/** One stack back out of a Bedrock item compound, or null for a slot holding nothing. */
export const itemStackFromNbt = (entry: NBTTagCompound): StoredItemStack | null => {
    const name = entry.getString('Name', '');
    const count = entry.getByte('Count', 0);
    if (name === '' || count <= 0) return null;

    const tag = entry.getCompound('tag', false);
    const display = tag?.getCompound('display', false) ?? null;
    const meta = entry.getShort('Damage', 0);
    const damage = tag?.getNumber('Damage', 0) ?? 0;
    const customName = display?.getString('Name', '') ?? '';
    const lore = display === null ? [] : stringsIn(display, 'Lore');
    const enchantments = enchantmentsFromNbt(tag);
    const contents = tag === null ? [] : itemSlotsFromNbt(tag, ITEMS_TAG);

    return {
        name,
        count,
        ...(meta === 0 ? {} : { meta }),
        ...(damage === 0 ? {} : { damage }),
        ...(customName === '' ? {} : { customName }),
        ...(lore.length === 0 ? {} : { lore }),
        ...(enchantments === undefined ? {} : { enchantments }),
        ...(contents.length === 0 ? {} : { contents: denseSlots(contents) })
    };
};

/**
 * A list tag holding the filled slots of a container.
 *
 * Only the filled ones, which is how vanilla writes a container: the list length is not the
 * slot count, and each entry carries the slot it belongs in.
 */
export const itemSlotsToNbt = (slots: readonly (StoredItemStack | null | undefined)[]): Set<NBTTagCompound> => {
    const list = new Set<NBTTagCompound>();
    slots.forEach((stack, slot) => {
        if (stack !== null && stack !== undefined) list.add(itemStackToNbt(stack, slot));
    });
    return list;
};

/**
 * The filled slots of a list tag, with the slot each one sits in.
 *
 * @returns One entry per readable compound, in list order. A compound with no `Slot` takes its
 *   position in the list, which is what a writer that numbered nothing meant.
 */
export const itemSlotsFromNbt = (nbt: NBTTagCompound, tag: string): NbtItemSlot[] => {
    const placed: NbtItemSlot[] = [];

    compoundsIn(nbt, tag).forEach((entry, index) => {
        const stack = itemStackFromNbt(entry);
        if (stack === null) return;
        placed.push({ slot: entry.getByte('Slot', index), stack });
    });

    return placed;
};

/** Slots by index, long enough to hold the highest one, with the gaps left null. */
const denseSlots = (placed: readonly NbtItemSlot[]): (StoredItemStack | null)[] => {
    let size = 0;
    for (const { slot } of placed) size = Math.max(size, slot + 1);

    const slots = new Array<StoredItemStack | null>(size).fill(null);
    for (const { slot, stack } of placed) slots[slot] = stack;
    return slots;
};
