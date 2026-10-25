/**
 * What a mob spawns holding and wearing.
 *
 * `minecraft:equipment` was parsed and thrown away: the component's loot table was read into
 * `EquipmentParams` and its factory returned `{}`, so no mob ever rolled it. A census of 90
 * live bodies found none holding an item. A skeleton fired from an empty fist, a zombie
 * spawned bare, and the villager's trade offer and the enderman's carried block were written to
 * `MobBody.carried` by the goals and read back only by other goals, because nothing mirrored
 * them onto the body a client is sent.
 *
 * ## Which table a mob rolls
 *
 * Bedrock drives mob gear from a loot table where Java hardcodes it in
 * `Mob.populateDefaultEquipmentSlots`, so the component's `table` is the reference for what a
 * mob spawns holding. Those tables are the behavior pack's own, and Java has no counterpart:
 * Java's registry carries `entities/skeleton` but no `entities/skeleton_gear`, and its only
 * three `equipment/` tables are trial chamber ones. So the roll reads
 * `definitions.lootTables`, the Bedrock registry, through the evaluator in
 * `@jsprismarine/loot` rather than through a second evaluator written for it.
 *
 * ## Which pools it rolls
 *
 * All of them. The registry is built with `dialect: 'bedrock'`, so the evaluator reads the
 * plural `conditions` arrays, the three chance conditions, the pool-level `tiers` and the
 * `pools` an entry nests, which is the whole of what these tables are written in.
 *
 * It did not always. `@jsprismarine/loot` read modern Java only, where a pool carries one
 * `condition`, and a condition it did not read was a condition that did not gate: handed
 * `zombie_equipment.json` whole it armed 2000 of 2000 zombies, where the table says
 * `max_chance: 0.05`. The workaround dropped every pool it could not gate, which left 13 of the
 * 18 vanilla types with their signature weapon and nothing else, zombies included. With the
 * dialect read the measured rate is 99 of 2000, and all 18 types roll what their table says.
 *
 * One member of the grammar is still not applied, and it reports rather than going quiet:
 * `functions`, which is what would enchant rolled gear and vary a count. A skeleton's bow
 * arrives unenchanted.
 *
 * ## Which slot a rolled item lands in
 *
 * The table names items, not slots. `skeleton_gear.json` rolls `minecraft:bow` and
 * `armor_set_iron.json` rolls `minecraft:iron_helmet`, and neither says where it goes. The item
 * says: `minecraft:equippable.slot` is the game's own answer, and an item carrying no such
 * component is a weapon, which is why a bow and the fox's emerald both land in the main hand.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { LootRegistry } from '@jsprismarine/loot';

import type { ContentItemDrop } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';
import type { Item } from '../item/Item';
import type { ViewableEquipment } from './predicateView';

/**
 * The slots a mob's equipment reaches a client in.
 *
 * The keys of {@link ViewableEquipment}, which is the record the rest of the server already
 * passes around as "items by slot", so the enchantment views and this agree by construction
 * rather than by being kept in step. `satisfies` is the tie: a slot added or renamed there
 * fails to compile here until this tuple lists it.
 *
 * `body` is deliberately absent. `MobArmorEquipmentPacket` carries the slot, but it holds horse
 * armor, llama carpet and wolf armor, none of which an equipment table rolls, and the existing
 * send writes air into it.
 */
export const MOB_EQUIPMENT_SLOTS = [
    'mainhand',
    'offhand',
    'head',
    'chest',
    'legs',
    'feet'
] as const satisfies readonly (keyof ViewableEquipment)[];

/** One of {@link MOB_EQUIPMENT_SLOTS}. */
export type MobEquipmentSlot = (typeof MOB_EQUIPMENT_SLOTS)[number];

/** What a mob has in each slot, with a slot it has nothing in left out. */
export type MobEquipmentSet = Readonly<Partial<Record<MobEquipmentSlot, ContentItemDrop>>>;

/** Nothing in any slot, which is what a mob with no `minecraft:equipment` has. */
export const NO_EQUIPMENT: MobEquipmentSet = {};

/** The slots {@link MOB_EQUIPMENT_SLOTS} names, as a set, for narrowing a parsed slot name. */
const SLOTS: ReadonlySet<string> = new Set<string>(MOB_EQUIPMENT_SLOTS);

/**
 * The slot a `minecraft:equipment.slot_drop_chance` entry names.
 *
 * A behavior pack spells these `slot.weapon.mainhand` and `slot.armor.head`, the engine's own
 * slot vocabulary rather than the item component's. The last segment is the same word in both,
 * so dropping the prefix is the whole translation.
 *
 * @param name - The slot as the component spells it.
 * @returns The slot, or undefined for a name no mob equipment slot matches, which
 *   `slot.armor.saddle` and `slot.hotbar` are.
 */
export const mobEquipmentSlotOf = (name: string): MobEquipmentSlot | undefined => {
    const last = name.slice(name.lastIndexOf('.') + 1);
    // The set is built from the tuple above, so a hit is one of its members.
    return SLOTS.has(last) ? (last as MobEquipmentSlot) : undefined;
};

/**
 * Where one rolled item goes.
 *
 * `minecraft:equippable` is the game's own answer and the only one that stays right as the item
 * set changes; a table of identifiers here would go stale the first time a pack added a helmet.
 * An item without the component is a weapon rather than nothing, so a bow, a crossbow and the
 * fox's emerald all reach the main hand.
 *
 * @param item - The rolled item, resolved against the running content. Only its declared slot
 *   is read, which is the whole of what this needs an item for.
 * @returns The slot it occupies.
 */
export const slotForItem = (item: Pick<Item, 'getEquipmentSlot'>): MobEquipmentSlot => {
    const declared = item.getEquipmentSlot();
    if (declared === undefined) return 'mainhand';

    // `any`, `hand`, `armor` and `saddle` are categories rather than slots, so they fall
    // through to the hand the way an item with no component does.
    return mobEquipmentSlotOf(declared) ?? 'mainhand';
};

/**
 * The evaluator for one content build's equipment tables, built on first use.
 *
 * Keyed by the content rather than rebuilt per roll because compiling a table is the expensive
 * half and `ServerContent` is built once and kept. `LootPackDefinitions` asks for its tables
 * under `lootTablesJava`, so handing it the Bedrock map there is what points the evaluator at
 * the Bedrock registry; `dialect` is what tells it which grammar that map is written in.
 */
const registries = new WeakMap<ServerContent, LootRegistry>();

/** The equipment loot registry for one content build. */
export const equipmentRegistry = (content: ServerContent): LootRegistry => {
    const existing = registries.get(content);
    if (existing !== undefined) return existing;

    const registry = new LootRegistry(
        { ...content.definitions, lootTablesJava: content.definitions.lootTables },
        { dialect: 'bedrock', worldSeed: content.loot.worldSeed }
    );
    registries.set(content, registry);

    return registry;
};

/** What {@link rollMobEquipment} reads. */
export interface MobEquipmentRollOptions {
    /** The running content: the tables to roll and the items to resolve against. */
    readonly content: ServerContent;
    /** The `minecraft:equipment.table` the entity's active components name. */
    readonly table: string;
    /** Resolves one rolled drop to an item, so this module does not reach into the inventory. */
    readonly itemOf: (drop: ContentItemDrop) => Item | null;
    /** Where a drop that resolves to no item is reported. */
    readonly report?: (message: string) => void;
}

/**
 * Rolls one equipment table and sorts what it produced into slots.
 *
 * A later entry wins a slot an earlier one filled, which is the order the pools are written in.
 *
 * @returns What the mob holds and wears. Empty when the registry has no such table, and empty
 *   for a roll whose every pool failed its chance gate, which is what a zombie spawning bare
 *   is.
 */
export const rollMobEquipment = (options: MobEquipmentRollOptions): MobEquipmentSet => {
    const { content, table, itemOf, report } = options;

    const equipment: Partial<Record<MobEquipmentSlot, ContentItemDrop>> = {};
    for (const stack of equipmentRegistry(content).roll(table)) {
        if (stack.count <= 0) continue;

        const drop = { identifier: stack.id, count: stack.count };
        const item = itemOf(drop);
        if (item === null) {
            report?.(`${table} rolled ${stack.id}, which resolves to no item`);
            continue;
        }

        equipment[slotForItem(item)] = drop;
    }

    return equipment;
};

/**
 * The bytes one slot travels as, which is how `MobEquipmentPacket` and
 * `MobArmorEquipmentPacket` both write an item.
 *
 * An empty slot is the empty buffer rather than air's encoding, which is enough to tell it from
 * a slot holding something: nothing encodes to no bytes.
 */
const slotBytes = (item: Item | undefined): Buffer => {
    if (item === undefined) return Buffer.alloc(0);

    const stream = new BinaryStream();
    item.networkSerialize(stream);

    return stream.getBuffer();
};

/**
 * Whether two sets of resolved items would reach a client as the same bytes.
 *
 * Compared as what the packets carry rather than field by field, which is the same test
 * `blockentity/blockEntityWrite.ts` applies to a block entity compound and for the same reason:
 * two items that encode identically are the same item to a client however they were built, and
 * an item rebuilt from a saved drop has been through a round trip the one it is compared
 * against has not.
 */
export const sameEquipmentItems = (left: ViewableEquipment, right: ViewableEquipment): boolean =>
    MOB_EQUIPMENT_SLOTS.every((slot) => slotBytes(left[slot]).equals(slotBytes(right[slot])));

/**
 * Whether two sets of equipment would reach a client as the same thing.
 *
 * Compared over the drops rather than over the encoded packets because a drop is already the
 * whole of what the packet carries: the identifier, the count, the aux value, the durability,
 * the name, the lore and the enchantments. Two drops agreeing on all of those encode the same
 * bytes, and nothing else about a drop reaches the wire.
 */
export const sameEquipment = (left: MobEquipmentSet, right: MobEquipmentSet): boolean =>
    MOB_EQUIPMENT_SLOTS.every((slot) => sameDrop(left[slot], right[slot]));

/** Whether two drops are the same item in the same condition. */
const sameDrop = (left: ContentItemDrop | undefined, right: ContentItemDrop | undefined): boolean => {
    if (left === undefined || right === undefined) return left === right;

    return (
        left.identifier === right.identifier &&
        left.count === right.count &&
        (left.meta ?? 0) === (right.meta ?? 0) &&
        (left.damage ?? 0) === (right.damage ?? 0) &&
        left.customName === right.customName &&
        sameList(left.lore, right.lore) &&
        sameEnchantments(left.enchantments, right.enchantments)
    );
};

/** Whether two optional string lists hold the same strings in the same order. */
const sameList = (left: readonly string[] | undefined, right: readonly string[] | undefined): boolean => {
    if (left === undefined || right === undefined) return (left?.length ?? 0) === (right?.length ?? 0);

    return left.length === right.length && left.every((entry, index) => entry === right[index]);
};

/** Whether two enchantment maps hold the same levels, however their keys are ordered. */
const sameEnchantments = (
    left: Readonly<Record<string, number>> | undefined,
    right: Readonly<Record<string, number>> | undefined
): boolean => {
    const ours = Object.entries(left ?? {});

    return ours.length === Object.keys(right ?? {}).length && ours.every(([id, level]) => right?.[id] === level);
};
