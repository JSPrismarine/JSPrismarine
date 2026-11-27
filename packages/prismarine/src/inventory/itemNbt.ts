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
 * the enchantments as `ench`, a container item's own inventory as a nested `Items` list, which
 * is where Bedrock keeps what a shulker box holds, `minecraft:keep_on_death`,
 * `minecraft:item_lock`, and the script dynamic properties as `DynamicProperties`. What the stack
 * may be placed on and may break go beside `tag`, as `CanPlaceOn` and `CanDestroy`.
 *
 * A stack's other Java components, such as a trim or a firework's explosions, go out twice for
 * the same reason: as the Bedrock tags `item/componentTags.ts` writes, which the game draws, and
 * as Java's JSON under {@link COMPONENTS_TAG}, which is what this reads back.
 *
 * The enchantments go out twice on purpose. `ench` carries the Bedrock numbers the client and
 * a vanilla tool read, and that table covers 37 of the 43 Java enchantments and none of a
 * datapack's, so the Java ids are written beside it under {@link ENCHANTMENTS_TAG} and read
 * back from there first. Without the second copy a Sweeping Edge sword comes back unenchanted.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import type { ItemDynamicProperties } from '@jsprismarine/block-behaviors';

import { bedrockEnchantType, javaEnchantmentId } from '../enchantment/bedrockIds';
import type { DynamicProperties } from '../world/dynamicProperties';
import { DYNAMIC_PROPERTIES_TAG, dynamicPropertiesFromNbt, dynamicPropertiesToNbt } from '../world/dynamicProperties';
import type { StoredItemStack } from './persistence';
import { addComponentTags } from '../item/componentTags';
import { hasStackComponents, stackComponentsOf } from '../item/stackComponents';
import type { StackComponents } from '../item/stackComponents';
import { isRecord } from '../utils/isRecord';

/** Bedrock's own list tag for the stacks a container holds. */
export const ITEMS_TAG = 'Items';

/** The Java enchantment ids, under the stack's `tag`, beside Bedrock's own `ench` list. */
export const ENCHANTMENTS_TAG = 'jsprismarine:enchantments';

/** The stack's other Java components, under its `tag`, as one JSON string. */
export const COMPONENTS_TAG = 'jsprismarine:components';

/** Bedrock's tag for a stack kept on death, a byte set to 1. */
const KEEP_ON_DEATH_TAG = 'minecraft:keep_on_death';

/** Bedrock's tag for a locked stack, a byte: 1 locks it in its slot and 2 in the inventory. */
const ITEM_LOCK_TAG = 'minecraft:item_lock';

/** Bedrock's key for which saved map a filled map shows, a long. */
const MAP_UUID_TAG = 'map_uuid';

/**
 * Writes which saved map a filled map shows, as a Bedrock map item carries it: `map_uuid`, the
 * id the client asks for the map's pixels and markers by, and the two keys GeyserMC writes
 * beside it so the client names and draws the map: `map_name_index` and `map_display_players`.
 * The pinned Bedrock Dedicated Server's binary holds the same key names.
 */
export const addMapIdTags = (tag: NBTTagCompound, mapId: number): void => {
    tag.addValue(MAP_UUID_TAG, new Types.LongVal(BigInt(mapId)));
    tag.addValue('map_name_index', new Types.NumberVal(mapId));
    tag.addValue('map_display_players', new Types.ByteVal(1));
};

/** The {@link ITEM_LOCK_TAG} byte of each lock mode. */
const LOCK_BYTES = { slot: 1, inventory: 2 } as const;

/** A stack's dynamic properties as the NBT helpers take them, by pack and then by id. */
const propertyMaps = (properties: ItemDynamicProperties) =>
    new Map(Object.entries(properties).map(([pack, values]) => [pack, new Map(Object.entries(values))]));

/** A stack's dynamic properties back out of the NBT helpers' maps, leaving out a pack with none. */
const propertyRecords = (maps: DynamicProperties): ItemDynamicProperties =>
    Object.fromEntries(
        [...maps].filter(([, values]) => values.size > 0).map(([pack, values]) => [pack, Object.fromEntries(values)])
    );

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

/** The components {@link COMPONENTS_TAG} holds, or undefined for a record without a readable copy. */
const componentsFromNbt = (tag: NBTTagCompound | null): StackComponents | undefined => {
    const json = tag?.getString(COMPONENTS_TAG, '') ?? '';
    if (json === '') return undefined;
    try {
        const parsed: unknown = JSON.parse(json);
        const components = isRecord(parsed) ? stackComponentsOf(parsed) : {};
        return hasStackComponents(components) ? components : undefined;
    } catch {
        // A record somebody else edited by hand. The stack loses what it cannot read rather than
        // the whole inventory failing to load.
        return undefined;
    }
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
    if (stack.canPlaceOn && stack.canPlaceOn.length > 0) entry.addValue('CanPlaceOn', stringList(stack.canPlaceOn));
    if (stack.canDestroy && stack.canDestroy.length > 0) entry.addValue('CanDestroy', stringList(stack.canDestroy));

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

    if (stack.keepOnDeath === true) {
        tag.addValue(KEEP_ON_DEATH_TAG, new Types.ByteVal(1));
        anything = true;
    }
    if (stack.mapId !== undefined) {
        addMapIdTags(tag, stack.mapId);
        anything = true;
    }
    if (stack.lockMode !== undefined) {
        tag.addValue(ITEM_LOCK_TAG, new Types.ByteVal(LOCK_BYTES[stack.lockMode]));
        anything = true;
    }
    if (hasStackComponents(stack.components)) {
        addComponentTags(tag, stack.components);
        tag.addValue(COMPONENTS_TAG, new Types.StringVal(JSON.stringify(stack.components)));
        anything = true;
    }
    const properties = propertyMaps(stack.dynamicProperties ?? {});
    if ([...properties.values()].some((values) => values.size > 0)) {
        tag.addChild(dynamicPropertiesToNbt(properties, DYNAMIC_PROPERTIES_TAG));
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
    const canPlaceOn = stringsIn(entry, 'CanPlaceOn');
    const canDestroy = stringsIn(entry, 'CanDestroy');
    const keepOnDeath = tag?.getByte(KEEP_ON_DEATH_TAG, 0) === 1;
    const mapId = tag?.has(MAP_UUID_TAG) === true ? Number(tag.getLong(MAP_UUID_TAG, 0n)) : undefined;
    const lock = tag?.getByte(ITEM_LOCK_TAG, 0) ?? 0;
    const lockMode = lock === LOCK_BYTES.slot ? 'slot' : lock === LOCK_BYTES.inventory ? 'inventory' : undefined;
    const propertiesTag = tag?.getCompound(DYNAMIC_PROPERTIES_TAG, false) ?? null;
    const dynamicProperties = propertiesTag === null ? {} : propertyRecords(dynamicPropertiesFromNbt(propertiesTag));
    const components = componentsFromNbt(tag);

    return {
        name,
        count,
        ...(meta === 0 ? {} : { meta }),
        ...(damage === 0 ? {} : { damage }),
        ...(customName === '' ? {} : { customName }),
        ...(lore.length === 0 ? {} : { lore }),
        ...(enchantments === undefined ? {} : { enchantments }),
        ...(contents.length === 0 ? {} : { contents: denseSlots(contents) }),
        ...(canPlaceOn.length === 0 ? {} : { canPlaceOn }),
        ...(canDestroy.length === 0 ? {} : { canDestroy }),
        ...(keepOnDeath ? { keepOnDeath } : {}),
        ...(mapId !== undefined && Number.isSafeInteger(mapId) ? { mapId } : {}),
        ...(lockMode === undefined ? {} : { lockMode }),
        ...(Object.keys(dynamicProperties).length === 0 ? {} : { dynamicProperties }),
        ...(components === undefined ? {} : { components })
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
