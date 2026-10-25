/**
 * A player data record against the NBT a Bedrock world stores it as.
 *
 * Same rule as `blockentity/contentRecord.ts`: a field Bedrock has a schema for is written
 * under Bedrock's own tag, so a vanilla tool and the game itself read the record, and a field
 * it has no schema for goes under a namespaced tag of this project's own. `Inventory`, `Armor`,
 * `Offhand`, `EnderChestInventory`, `SelectedInventorySlot`, `PlayerGameType`, `Pos`,
 * `Rotation` and the `Attributes` list are all Bedrock's. The advancement progress and the
 * enchantment seed are not, so they live under {@link SAVED_TAG}.
 *
 * Item stacks go through `inventory/itemNbt.ts`, which is the one place that states Bedrock's
 * item compound; a container block entity writes its stacks through the same module.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';

import { itemSlotsFromNbt, itemSlotsToNbt } from '../../../inventory/itemNbt';
import type { StoredInventory, StoredItemStack } from '../../../inventory/persistence';
import type { WorldPlayerData } from '../../World';
import type { StoredSpawnPoint } from '../../RespawnPoint';

/** The compound holding every field Bedrock has no schema for. */
const SAVED_TAG = 'JSPrismarine';

/** The containers a player carries, by the tag Bedrock files each under. */
const CONTAINER_TAGS = {
    items: 'Inventory',
    armor: 'Armor',
    offhand: 'Offhand',
    enderChest: 'EnderChestInventory'
} as const satisfies Record<Exclude<keyof StoredInventory, 'handSlot'>, string>;

/** How many slots each container has, so a read lands a slot index in the right place. */
const CONTAINER_SIZES = { items: 36, armor: 4, offhand: 1, enderChest: 27 } as const;

/** The attributes the record carries, by the identifier Bedrock files each under. */
const ATTRIBUTE_NAMES = {
    health: 'minecraft:health',
    food: 'minecraft:player.hunger',
    saturation: 'minecraft:player.saturation',
    level: 'minecraft:player.level',
    progress: 'minecraft:player.experience'
} as const;

/** The bounds Bedrock writes beside each attribute value. */
const ATTRIBUTE_BOUNDS: Record<keyof typeof ATTRIBUTE_NAMES, { min: number; max: number }> = {
    health: { min: 0, max: 20 },
    food: { min: 0, max: 20 },
    saturation: { min: 0, max: 20 },
    level: { min: 0, max: 24791 },
    progress: { min: 0, max: 1 }
};

const floatList = (values: readonly number[]): Set<Types.FloatVal> =>
    new Set(values.map((value) => new Types.FloatVal(value)));

const numbersIn = (nbt: NBTTagCompound, name: string): number[] => {
    const values = nbt.getList(name, false);
    return values ? Array.from(values, (value) => Number(value?.getValue?.() ?? value ?? 0)) : [];
};

const compoundsIn = (nbt: NBTTagCompound, name: string): NBTTagCompound[] => {
    const values = nbt.getList(name, false);
    if (values === null) return [];

    const compounds: NBTTagCompound[] = [];
    for (const value of values) if (value instanceof NBTTagCompound) compounds.push(value);
    return compounds;
};

/** A gamemode name for whatever number the record holds, rather than a throw for an odd one. */
const gamemodeName = (value: number): string => {
    try {
        return getGametypeName(value);
    } catch {
        return 'Survival';
    }
};

/** One container back as a dense slot array, since vanilla writes only the filled slots. */
const containerFromNbt = (nbt: NBTTagCompound, tag: string, size: number): (StoredItemStack | null)[] => {
    const slots = new Array<StoredItemStack | null>(size).fill(null);

    for (const { slot, stack } of itemSlotsFromNbt(nbt, tag)) {
        if (slot >= 0 && slot < slots.length) slots[slot] = stack;
    }

    return slots;
};

/** Bedrock's `Attributes` list for the values the record carries. */
const attributesToNbt = (data: WorldPlayerData): Set<NBTTagCompound> => {
    const values: Partial<Record<keyof typeof ATTRIBUTE_NAMES, number>> = {
        health: data.health,
        food: data.food,
        saturation: data.saturation,
        level: data.experience?.level,
        progress: data.experience?.progress
    };

    const list = new Set<NBTTagCompound>();
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;

        const field = key as keyof typeof ATTRIBUTE_NAMES;
        const bounds = ATTRIBUTE_BOUNDS[field];
        const attribute = new NBTTagCompound('');
        attribute.addValue('Name', new Types.StringVal(ATTRIBUTE_NAMES[field]));
        attribute.addValue('Base', new Types.FloatVal(value));
        attribute.addValue('Current', new Types.FloatVal(value));
        attribute.addValue('Min', new Types.FloatVal(bounds.min));
        attribute.addValue('Max', new Types.FloatVal(bounds.max));
        list.add(attribute);
    }

    return list;
};

/** The `Current` of each attribute the record knows, by its own field name. */
const attributesFromNbt = (nbt: NBTTagCompound): Partial<Record<keyof typeof ATTRIBUTE_NAMES, number>> => {
    const byName = new Map(compoundsIn(nbt, 'Attributes').map((entry) => [entry.getString('Name', ''), entry]));

    const values: Partial<Record<keyof typeof ATTRIBUTE_NAMES, number>> = {};
    for (const [field, name] of Object.entries(ATTRIBUTE_NAMES)) {
        const entry = byName.get(name);
        if (entry === undefined) continue;

        values[field as keyof typeof ATTRIBUTE_NAMES] = entry.getFloat('Current', entry.getFloat('Base', 0));
    }

    return values;
};

/** Everything a player carries, as the four lists and the selected slot Bedrock writes. */
const inventoryToNbt = (root: NBTTagCompound, inventory: StoredInventory | undefined): void => {
    if (inventory === undefined) return;

    for (const [field, tag] of Object.entries(CONTAINER_TAGS)) {
        root.addValue(tag, itemSlotsToNbt(inventory[field as keyof typeof CONTAINER_TAGS]));
    }
    root.addValue('SelectedInventorySlot', new Types.NumberVal(inventory.handSlot));
};

/** The carried state read back, or undefined when the record holds no inventory at all. */
const inventoryFromNbt = (root: NBTTagCompound): StoredInventory | undefined => {
    if (!root.has(CONTAINER_TAGS.items)) return undefined;

    return {
        items: containerFromNbt(root, CONTAINER_TAGS.items, CONTAINER_SIZES.items),
        handSlot: root.getNumber('SelectedInventorySlot', 0),
        armor: containerFromNbt(root, CONTAINER_TAGS.armor, CONTAINER_SIZES.armor),
        offhand: containerFromNbt(root, CONTAINER_TAGS.offhand, CONTAINER_SIZES.offhand),
        enderChest: containerFromNbt(root, CONTAINER_TAGS.enderChest, CONTAINER_SIZES.enderChest)
    };
};

/**
 * Bedrock's own tags for a player's spawn point.
 *
 * `SpawnX`, `SpawnY` and `SpawnZ` are what the game writes, and `SpawnDimension` is the numeric
 * dimension beside them. Whether the point was forced is not a thing Bedrock records - it has no
 * `/spawnpoint` that sets one - so that flag goes under {@link SAVED_TAG} with the dimension's
 * namespaced identifier, which is what this server addresses a world by.
 */
const SPAWN_TAGS = { x: 'SpawnX', y: 'SpawnY', z: 'SpawnZ' } as const;

/** The spawn point as the record carries it, out of whichever half of it is there. */
const spawnFromNbt = (root: NBTTagCompound, saved: NBTTagCompound | null): StoredSpawnPoint | undefined => {
    const dimension = saved?.getString('spawnDimension', '') ?? '';
    if (dimension === '' || !root.has(SPAWN_TAGS.x)) return undefined;

    return {
        x: root.getNumber(SPAWN_TAGS.x, 0),
        y: root.getNumber(SPAWN_TAGS.y, 0),
        z: root.getNumber(SPAWN_TAGS.z, 0),
        dimension,
        ...(saved?.getByte('spawnForced', 0) === 1 ? { forced: true } : {})
    };
};

/** A player data record as the compound stored under `player_server_<key>`. */
export const playerDataToNbt = (data: WorldPlayerData): NBTTagCompound => {
    const root = new NBTTagCompound('');
    root.addValue('NameTag', new Types.StringVal(data.username ?? ''));
    root.addValue('PlayerGameType', new Types.NumberVal(getGametypeId(data.gamemode)));
    root.addValue('Pos', floatList([data.position.x, data.position.y, data.position.z]));
    root.addValue('Rotation', floatList([data.position.yaw, data.position.pitch]));
    root.addValue('Attributes', attributesToNbt(data));
    inventoryToNbt(root, data.inventory);

    if (data.spawn !== undefined) {
        root.addValue(SPAWN_TAGS.x, new Types.NumberVal(Math.floor(data.spawn.x)));
        root.addValue(SPAWN_TAGS.y, new Types.NumberVal(Math.floor(data.spawn.y)));
        root.addValue(SPAWN_TAGS.z, new Types.NumberVal(Math.floor(data.spawn.z)));
    }

    const saved = new NBTTagCompound(SAVED_TAG);
    if (data.uuid !== undefined) saved.addValue('uuid', new Types.StringVal(data.uuid));
    if (data.username !== undefined) saved.addValue('username', new Types.StringVal(data.username));
    saved.addValue('gamemode', new Types.StringVal(data.gamemode));
    if (data.enchantmentSeed !== undefined) {
        saved.addValue('enchantmentSeed', new Types.NumberVal(data.enchantmentSeed));
    }
    if (data.savedAt !== undefined) saved.addValue('savedAt', new Types.DoubleVal(data.savedAt));
    if (data.spawn !== undefined) {
        saved.addValue('spawnDimension', new Types.StringVal(data.spawn.dimension));
        saved.addValue('spawnForced', new Types.ByteVal(data.spawn.forced === true ? 1 : 0));
    }
    if (data.advancements !== undefined) {
        // JSON under one string tag, for the reason `contentRecord.ts` gives: Bedrock has no
        // schema for advancement progress, and inventing an NBT width per field would lose the
        // difference between 1 and 1.0 on the way back.
        saved.addValue('advancements', new Types.StringVal(JSON.stringify(data.advancements)));
    }

    const position = new NBTTagCompound('position');
    position.addValue('x', new Types.DoubleVal(data.position.x));
    position.addValue('y', new Types.DoubleVal(data.position.y));
    position.addValue('z', new Types.DoubleVal(data.position.z));
    position.addValue('pitch', new Types.DoubleVal(data.position.pitch));
    position.addValue('yaw', new Types.DoubleVal(data.position.yaw));
    position.addValue('headYaw', new Types.DoubleVal(data.position.headYaw));
    saved.addChild(position);
    root.addChild(saved);

    return root;
};

/** A stored compound back as a player data record. */
export const playerDataFromNbt = (nbt: NBTTagCompound): WorldPlayerData => {
    const saved = nbt.getCompound(SAVED_TAG, false);
    const savedPosition = saved?.getCompound('position', false);
    const position = numbersIn(nbt, 'Pos');
    const rotation = numbersIn(nbt, 'Rotation');
    const gameMode = saved?.getString('gamemode', '') || gamemodeName(nbt.getNumber('PlayerGameType', 0));
    const username = saved?.getString('username', nbt.getString('NameTag', '')) ?? '';
    const attributes = attributesFromNbt(nbt);
    const inventory = inventoryFromNbt(nbt);
    const advancements = saved?.getString('advancements', '') ?? '';
    const spawn = spawnFromNbt(nbt, saved);

    return {
        ...(saved?.has('uuid') ? { uuid: saved.getString('uuid', '') } : {}),
        ...(username.length > 0 ? { username } : {}),
        gamemode: gameMode,
        position: {
            x: savedPosition?.getDouble('x', position[0] ?? 0) ?? position[0] ?? 0,
            y: savedPosition?.getDouble('y', position[1] ?? 0) ?? position[1] ?? 0,
            z: savedPosition?.getDouble('z', position[2] ?? 0) ?? position[2] ?? 0,
            pitch: savedPosition?.getDouble('pitch', rotation[1] ?? 0) ?? rotation[1] ?? 0,
            yaw: savedPosition?.getDouble('yaw', rotation[0] ?? 0) ?? rotation[0] ?? 0,
            headYaw: savedPosition?.getDouble('headYaw', rotation[0] ?? 0) ?? rotation[0] ?? 0
        },
        ...(saved?.has('enchantmentSeed') ? { enchantmentSeed: saved.getNumber('enchantmentSeed', 0) } : {}),
        ...(advancements === '' ? {} : { advancements: parseAdvancements(advancements) }),
        ...(spawn === undefined ? {} : { spawn }),
        ...(saved?.has('savedAt') ? { savedAt: saved.getDouble('savedAt', 0) } : {}),
        ...(inventory === undefined ? {} : { inventory }),
        ...(attributes.health === undefined ? {} : { health: attributes.health }),
        ...(attributes.food === undefined ? {} : { food: attributes.food }),
        ...(attributes.saturation === undefined ? {} : { saturation: attributes.saturation }),
        ...(attributes.level === undefined && attributes.progress === undefined
            ? {}
            : { experience: { level: attributes.level ?? 0, progress: attributes.progress ?? 0 } })
    };
};

/**
 * The advancement progress out of its JSON tag.
 *
 * Parsed JSON is a boundary the compiler cannot see. A tag some other writer put there under
 * the same name costs the progress and nothing else, which beats refusing to load the player.
 */
const parseAdvancements = (encoded: string): WorldPlayerData['advancements'] => {
    try {
        const parsed: unknown = JSON.parse(encoded);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as WorldPlayerData['advancements'])
            : undefined;
    } catch {
        return undefined;
    }
};
