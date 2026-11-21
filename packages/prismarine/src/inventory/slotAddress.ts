/**
 * Every item slot name a command can write, read into the container slot it means on one entity
 * or one block ([plan](../../../../docs/plans/unified-item-slots.md), decision 6).
 *
 * Two spellings reach the server:
 *
 * - **Java's** is one string per slot, `container.3`, `armor.head`, `horse.4`, from
 *   `SlotRanges`. Each name stands for a number (`hotbar.0` is 0, `inventory.0` is 9,
 *   `enderchest.0` is 200, `armor.feet` is 100), and the entity the command addresses decides
 *   which of its slots that number is, the way Java's `Entity.getSlot(int)` does. So
 *   `container.0` on a player is hotbar slot 0, on a chest minecart its first slot, and on a
 *   zombie nothing at all. `/loot replace … container.0 3` counts on from that number. A name
 *   ending in `*` stands for several numbers, and the slots an entity lacks are left out of it.
 * - **Bedrock's** is a group and an index, `slot.hotbar 3`, from the client's
 *   `EntityEquipmentSlot` and `BlockEquipmentSlot` enums. An index outside the group is refused
 *   with the range it may take.
 *
 * Both resolve to a {@link HeldSlot}: a container and a slot of an {@link EntityInventory}, or a
 * slot of a block's container. Nothing here reads or writes an item; the caller does that, so
 * `/replaceitem`, `/item`, `/loot replace` and the parity suite read the same slot for one name.
 */
import { BLOCK_EQUIPMENT_SLOTS } from '@jsprismarine/commands';

import type { EquippableSlot } from '../entity/data/equippable';
import type { MobEquipmentSlot } from '../entity/equipment';
import { MOB_EQUIPMENT_SLOTS, mobEquipmentSlotOf } from '../entity/equipment';
import type { EntityInventory, SlotAddress } from './EntityInventory';
import { HOTBAR_SIZE } from './EntityInventory';

/** Where one named slot is: a container slot of an entity, or a slot of a block's container. */
export type HeldSlot =
    | (SlotAddress & {
          /**
           * The equipment slot that reads this container slot once the write lands, which is a
           * mount's `body` when its armor or carpet goes into its own container slot.
           */
          readonly alias?: MobEquipmentSlot;
      })
    | { readonly container: 'block'; readonly slot: number };

/**
 * What a slot name is resolved against.
 *
 * - A player has a hotbar, an ender chest and a cursor, and its main hand is a hotbar slot.
 * - A mob's `inventory` container means what its `minecraft:inventory` `container_type` says:
 *   `horse` is a mount's, whose chest slots are the ones its `minecraft:equippable` does not
 *   claim; `inventory`, the default, is a villager's or a piglin's pocket; any other type, such as
 *   `minecart_chest` or `chest_boat`, is a container Java addresses with `container.N`.
 * - A block has the slots of its container and nothing else.
 */
export type SlotHolder =
    | { readonly kind: 'player'; readonly inventory: EntityInventory }
    | {
          readonly kind: 'mob';
          readonly inventory: EntityInventory;
          /** The active `minecraft:inventory`'s `container_type`, or undefined when it has none. */
          readonly containerType: string | undefined;
          /** The slots the active `minecraft:equippable` lists, in its order. */
          readonly equippable: readonly EquippableSlot[];
      }
    | { readonly kind: 'block'; readonly size: number };

/** Which side of a copy a refusal is about, which is the word Java's messages use. */
export type SlotRole = 'source' | 'target';

/** The slots a name resolved to on one holder, or the sentence that says why it did not. */
export type SlotResolution =
    { readonly ok: true; readonly slots: readonly HeldSlot[] } | { readonly ok: false; readonly refusal: string };

// Java's slot numbers, from `SlotRanges` and `EquipmentSlot.getIndex` in Java 26.3.

/** `inventory.0`: the first main inventory slot past the hotbar. */
const JAVA_INVENTORY = 9;
/** `enderchest.0`. */
const JAVA_ENDER_CHEST = 200;
/** `mob.inventory.0`, a villager's, a piglin's or an allay's pocket. */
const JAVA_MOB_INVENTORY = 300;
/** `horse.chest` on a mount and `player.cursor` on a player: one number, two meanings. */
const JAVA_HORSE_CHEST_OR_CURSOR = 499;
/** `horse.0` on a mount and `player.crafting.0` on a player. */
const JAVA_HORSE_OR_CRAFTING = 500;

/** The number Java gives each equipment slot: its index inside its type plus 98, 100 or 105. */
const JAVA_EQUIPMENT_IDS: Readonly<Record<MobEquipmentSlot, number>> = {
    mainhand: 98,
    offhand: 99,
    feet: 100,
    legs: 101,
    chest: 102,
    head: 103,
    body: 105
};

/** `saddle`, Java's `EquipmentSlot.SADDLE`. */
const JAVA_SADDLE = 106;

/** The equipment slot each of Java's equipment numbers names. */
const EQUIPMENT_OF_JAVA_ID = new Map<number, MobEquipmentSlot>();
for (const slot of MOB_EQUIPMENT_SLOTS) EQUIPMENT_OF_JAVA_ID.set(JAVA_EQUIPMENT_IDS[slot], slot);

/** Every Java slot name with the numbers it stands for, in `SlotRanges.SLOTS` order. */
const JAVA_SLOT_NAMES = new Map<string, readonly number[]>();

/** `prefix0` to `prefix<size - 1>` from `base`, and `prefix*` for all of them, as `addSlotRange` adds them. */
const addRange = (prefix: string, base: number, size: number): void => {
    const all = Array.from({ length: size }, (_unused, index) => base + index);
    for (const [index, id] of all.entries()) JAVA_SLOT_NAMES.set(`${prefix}${index}`, [id]);
    JAVA_SLOT_NAMES.set(`${prefix}*`, all);
};

JAVA_SLOT_NAMES.set('contents', [0]);
addRange('container.', 0, 54);
addRange('hotbar.', 0, HOTBAR_SIZE);
addRange('inventory.', JAVA_INVENTORY, 27);
addRange('enderchest.', JAVA_ENDER_CHEST, 27);
addRange('mob.inventory.', JAVA_MOB_INVENTORY, 8);
addRange('horse.', JAVA_HORSE_OR_CRAFTING, 15);
JAVA_SLOT_NAMES.set('weapon', [JAVA_EQUIPMENT_IDS.mainhand]);
JAVA_SLOT_NAMES.set('weapon.mainhand', [JAVA_EQUIPMENT_IDS.mainhand]);
JAVA_SLOT_NAMES.set('weapon.offhand', [JAVA_EQUIPMENT_IDS.offhand]);
JAVA_SLOT_NAMES.set('weapon.*', [JAVA_EQUIPMENT_IDS.mainhand, JAVA_EQUIPMENT_IDS.offhand]);
JAVA_SLOT_NAMES.set('armor.head', [JAVA_EQUIPMENT_IDS.head]);
JAVA_SLOT_NAMES.set('armor.chest', [JAVA_EQUIPMENT_IDS.chest]);
JAVA_SLOT_NAMES.set('armor.legs', [JAVA_EQUIPMENT_IDS.legs]);
JAVA_SLOT_NAMES.set('armor.feet', [JAVA_EQUIPMENT_IDS.feet]);
JAVA_SLOT_NAMES.set('armor.body', [JAVA_EQUIPMENT_IDS.body]);
JAVA_SLOT_NAMES.set('armor.*', [
    JAVA_EQUIPMENT_IDS.head,
    JAVA_EQUIPMENT_IDS.chest,
    JAVA_EQUIPMENT_IDS.legs,
    JAVA_EQUIPMENT_IDS.feet,
    JAVA_EQUIPMENT_IDS.body
]);
JAVA_SLOT_NAMES.set('saddle', [JAVA_SADDLE]);
JAVA_SLOT_NAMES.set('horse.chest', [JAVA_HORSE_CHEST_OR_CURSOR]);
JAVA_SLOT_NAMES.set('player.cursor', [JAVA_HORSE_CHEST_OR_CURSOR]);
addRange('player.crafting.', JAVA_HORSE_OR_CRAFTING, 4);
// Two spellings older releases had and 26.3 does not: `villager.N`, which 1.21.5 renamed
// `mob.inventory.N`, and `horse.saddle`, which the `saddle` equipment slot replaced. Datapacks
// written for those releases still name them, and each has one meaning here.
addRange('villager.', JAVA_MOB_INVENTORY, 8);
JAVA_SLOT_NAMES.set('horse.saddle', [JAVA_SADDLE]);

/**
 * The numbers a Java slot name stands for.
 *
 * @param name - A name such as `container.5`, `armor.*` or `weapon`.
 * @returns The numbers in Java's order, or undefined for a name Java does not have.
 */
export const javaSlotIds = (name: string): readonly number[] | undefined => JAVA_SLOT_NAMES.get(name);

/** Every Java slot name this server reads, for a command's suggestions. */
export const javaSlotNames = (): readonly string[] => [...JAVA_SLOT_NAMES.keys()];

/**
 * How many slots past the one a name names an offset can reach: one more than Java's largest slot
 * number, `horse.14`. A larger offset resolves on no holder, since no container this server
 * builds has that many slots either, so `/loot replace` with a huge count stops here.
 */
export const SLOT_OFFSET_LIMIT = Math.max(...[...JAVA_SLOT_NAMES.values()].flat()) + 1;

/** A slot the holder has, nothing, or one the holder has that this server cannot write yet. */
type SlotLookup = HeldSlot | 'missing' | 'unreachable';

/** An `inventory` container slot, when the container has it. */
const inventorySlot = (inventory: EntityInventory, slot: number): SlotLookup =>
    inventory.containerNamed('inventory')?.has(slot) === true ? { container: 'inventory', slot } : 'missing';

/** A slot of a named container, when the inventory has that container and the slot. */
const containerSlot = (inventory: EntityInventory, container: SlotAddress['container'], slot: number): SlotLookup =>
    inventory.containerNamed(container)?.has(slot) === true ? { container, slot } : 'missing';

/** Whether an equippable slot takes a saddle, which is how a mount's saddle slot is told apart. */
const takesSaddle = (slot: EquippableSlot): boolean =>
    slot.acceptedItems.some((name) => name === 'saddle' || name.endsWith(':saddle'));

/**
 * A mob's `inventory` slots that its `minecraft:equippable` does not claim, in order: a donkey's
 * or a llama's chest. A horse's two slots are both claimed, so it has none.
 */
const chestSlotsOf = (holder: Extract<SlotHolder, { kind: 'mob' }>): number[] => {
    const size = holder.inventory.containerNamed('inventory')?.size ?? 0;
    const claimed = new Set(holder.equippable.map((slot) => slot.slot));
    return Array.from({ length: size }, (_unused, slot) => slot).filter((slot) => !claimed.has(slot));
};

/** Where a mob's equipment slot is, including a mount's body armor in its own container slot. */
const mobEquipmentSlot = (holder: Extract<SlotHolder, { kind: 'mob' }>, slot: MobEquipmentSlot): SlotLookup => {
    if (slot === 'body' && holder.containerType === 'horse') {
        // A mount wears its armor or its carpet in the container slot its equippable lists for
        // it, so the horse's screen shows it there. Once a write lands there the body reads it.
        const armor = holder.equippable.find((entry) => !takesSaddle(entry));
        const current = holder.inventory.equipmentAddress('body');
        if (current?.container === 'inventory') return current;
        if (armor !== undefined && holder.inventory.containerNamed('inventory')?.has(armor.slot) === true)
            return { container: 'inventory', slot: armor.slot, alias: 'body' };
    }
    return holder.inventory.equipmentAddress(slot) ?? 'missing';
};

/** What one of Java's slot numbers is on a player, as `Player.getSlot` reads it. */
const playerJavaSlot = (inventory: EntityInventory, id: number): SlotLookup => {
    const equipment = EQUIPMENT_OF_JAVA_ID.get(id);
    if (equipment !== undefined) return inventory.equipmentAddress(equipment) ?? 'missing';
    if (id >= 0 && id < JAVA_ENDER_CHEST) return inventorySlot(inventory, id);
    if (id >= JAVA_ENDER_CHEST && id < JAVA_MOB_INVENTORY)
        return containerSlot(inventory, 'ender_chest', id - JAVA_ENDER_CHEST);
    if (id === JAVA_HORSE_CHEST_OR_CURSOR) return containerSlot(inventory, 'cursor', 0);
    // The crafting grid is a `CraftingInput`, laid out as the open grid's size says, and not one
    // of the inventory's containers.
    if (id >= JAVA_HORSE_OR_CRAFTING && id < JAVA_HORSE_OR_CRAFTING + 4) return 'unreachable';
    return 'missing';
};

/** What one of Java's slot numbers is on a mob, as `Mob.getSlot` and its subclasses read it. */
const mobJavaSlot = (holder: Extract<SlotHolder, { kind: 'mob' }>, id: number): SlotLookup => {
    const equipment = EQUIPMENT_OF_JAVA_ID.get(id);
    if (equipment !== undefined) return mobEquipmentSlot(holder, equipment);
    if (id === JAVA_SADDLE) {
        const saddle = holder.equippable.find(takesSaddle);
        return saddle === undefined ? 'missing' : inventorySlot(holder.inventory, saddle.slot);
    }

    const type = holder.containerType;
    if (type === 'horse') {
        // A mount's chest is a flag and a block on its side, not an item in a slot.
        if (id === JAVA_HORSE_CHEST_OR_CURSOR) return 'unreachable';
        const chest = chestSlotsOf(holder)[id - JAVA_HORSE_OR_CRAFTING];
        return id >= JAVA_HORSE_OR_CRAFTING && chest !== undefined
            ? { container: 'inventory', slot: chest }
            : 'missing';
    }
    if (type === 'inventory') {
        return id >= JAVA_MOB_INVENTORY && id < JAVA_HORSE_CHEST_OR_CURSOR
            ? inventorySlot(holder.inventory, id - JAVA_MOB_INVENTORY)
            : 'missing';
    }
    if (type !== undefined && id >= 0 && id < JAVA_ENDER_CHEST) return inventorySlot(holder.inventory, id);
    return 'missing';
};

/**
 * What one of Java's slot numbers is on a holder.
 *
 * @returns The slot; `missing` when the holder has no such slot, which a wildcard skips; or
 *   `unreachable` for a slot Java has and this server keeps somewhere a command cannot write.
 */
const javaSlotOn = (holder: SlotHolder, id: number): SlotLookup => {
    if (holder.kind === 'player') return playerJavaSlot(holder.inventory, id);
    if (holder.kind === 'mob') return mobJavaSlot(holder, id);
    return id >= 0 && id < holder.size ? { container: 'block', slot: id } : 'missing';
};

/** Every slot of one Bedrock group on a holder, in index order. */
const bedrockGroupSlots = (holder: SlotHolder, group: string): readonly SlotLookup[] => {
    if (holder.kind === 'block') {
        // Bedrock's `BlockEquipmentSlot` enum has one value, `slot.container`.
        return BLOCK_EQUIPMENT_SLOTS.some((name) => name === group)
            ? Array.from({ length: holder.size }, (_unused, slot) => ({ container: 'block', slot }) as const)
            : [];
    }

    const { inventory } = holder;
    const equipment = mobEquipmentSlotOf(group);
    if (equipment !== undefined) {
        const slot =
            holder.kind === 'mob' ? mobEquipmentSlot(holder, equipment) : inventory.equipmentAddress(equipment);
        return slot === undefined || slot === 'missing' ? [] : [slot];
    }

    const all = (container: SlotAddress['container'], from = 0): HeldSlot[] => {
        const size = inventory.containerNamed(container)?.size ?? 0;
        return Array.from({ length: Math.max(0, size - from) }, (_unused, index) => ({
            container,
            slot: from + index
        }));
    };

    switch (group) {
        case 'slot.armor':
            return all('armor');
        case 'slot.hotbar':
            return holder.kind === 'player' ? all('inventory').slice(0, HOTBAR_SIZE) : [];
        case 'slot.inventory':
            // A player's starts past the hotbar; a mob's is its whole container.
            return all('inventory', holder.kind === 'player' ? HOTBAR_SIZE : 0);
        case 'slot.enderchest':
            return all('ender_chest');
        case 'slot.saddle': {
            const saddle = holder.kind === 'mob' ? holder.equippable.find(takesSaddle) : undefined;
            return saddle === undefined
                ? []
                : [inventorySlot(inventory, saddle.slot)].filter((slot) => slot !== 'missing');
        }
        case 'slot.chest':
            return holder.kind === 'mob' && holder.containerType === 'horse'
                ? chestSlotsOf(holder).map((slot) => ({ container: 'inventory', slot }))
                : [];
        case 'slot.equippable':
            return holder.kind === 'mob'
                ? holder.equippable
                      .map((entry) => inventorySlot(inventory, entry.slot))
                      .filter((slot) => slot !== 'missing')
                : [];
        default:
            return [];
    }
};

/** Java's refusal for a slot the holder does not have. */
const missingRefusal = (name: string, role: SlotRole): string => `The ${role} does not have slot ${name}`;

/** What a holder is, for a refusal that has to say so. */
const holderNoun = (holder: SlotHolder): string =>
    holder.kind === 'block' ? 'That block' : holder.kind === 'player' ? 'A player' : 'That entity';

/** How to read a name. */
export interface SlotNameOptions {
    /** Which side of a copy the name is on, for the refusal. Defaults to `target`. */
    readonly role?: SlotRole;
    /**
     * Whether a Java name must stand for exactly one slot, as `/loot replace`'s `slot` argument
     * must. Java refuses a wildcard there before it looks at any entity.
     */
    readonly single?: boolean;
    /** How far past the named slot to read, which is how `/loot replace … <count>` walks on. */
    readonly offset?: number;
}

/** Resolves a Java name, which never starts with `slot.`. */
const resolveJava = (name: string, holder: SlotHolder, options: SlotNameOptions): SlotResolution => {
    const ids = javaSlotIds(name);
    if (ids === undefined) return { ok: false, refusal: `Unknown slot '${name}'` };
    if (options.single === true && ids.length !== 1) {
        return { ok: false, refusal: `Only single slots allowed: got '${name}'` };
    }

    const slots: HeldSlot[] = [];
    let unreachable = false;
    for (const id of ids) {
        const found = javaSlotOn(holder, id + (options.offset ?? 0));
        if (found === 'unreachable') unreachable = true;
        else if (found !== 'missing') slots.push(found);
    }
    if (slots.length > 0) return { ok: true, slots };
    if (unreachable) return { ok: false, refusal: `Slot ${name} is not one this server can reach yet` };
    return { ok: false, refusal: missingRefusal(name, options.role ?? 'target') };
};

/** Resolves a Bedrock group and the index in it. */
const resolveBedrock = (group: string, index: number, holder: SlotHolder, options: SlotNameOptions): SlotResolution => {
    const slots = bedrockGroupSlots(holder, group);
    if (slots.length === 0) {
        return { ok: false, refusal: `${holderNoun(holder)} has no ${group} slots` };
    }
    const found = slots[index];
    if (found === undefined || found === 'missing' || found === 'unreachable' || !Number.isInteger(index)) {
        return {
            ok: false,
            refusal: `Could not ${options.role === 'source' ? 'read' : 'replace'} slot ${index}, must be a value between 0 and ${slots.length - 1}.`
        };
    }
    return { ok: true, slots: [found] };
};

/**
 * Resolves a slot name against one holder.
 *
 * @param slot - Java's name (`container.3`, `armor.*`), or Bedrock's group with its index
 *   (`slot.hotbar` and 3). A name that starts with `slot.` is Bedrock's; Java has none.
 * @param holder - The player, the mob or the block the name is read on.
 * @returns The slots the name means there, in Java's order for a wildcard, or a refusal written
 *   as a sentence a player can read: Java's own for an unknown name or a slot the holder lacks,
 *   Bedrock's for an index outside its group.
 */
export const resolveSlotName = (
    slot: { readonly name: string; readonly index?: number },
    holder: SlotHolder,
    options: SlotNameOptions = {}
): SlotResolution =>
    slot.name.startsWith('slot.')
        ? resolveBedrock(slot.name, (slot.index ?? 0) + (options.offset ?? 0), holder, options)
        : resolveJava(slot.name, holder, options);
