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
 * ## Which pools it rolls, and which it leaves alone
 *
 * `@jsprismarine/loot` implements modern Java, where a pool carries one `condition` and an
 * entry carries one `modifier`. Bedrock still writes the older plural arrays, `conditions` and
 * `functions`, and adds a pool-level `tiers`. The evaluator does not read any of those, and a
 * condition it does not read is a condition that does not gate: handed `zombie_equipment.json`
 * whole, it armed 2000 of 2000 zombies with an iron tool, where vanilla's
 * `random_regional_difficulty_chance` arms about one in twenty.
 *
 * So {@link prunedEquipmentTables} drops every pool this evaluator cannot gate faithfully and
 * keeps the rest. What survives is each mob's signature weapon, the part of the table that is
 * plain Java grammar and fires unconditionally in vanilla too: 13 of the 18 vanilla types that
 * carry the component get theirs, among them the skeleton's bow, the pillager's crossbow, the
 * vindicator's axe, the wither skeleton's stone sword and the piglin's golden one. What is
 * dropped is the chance-gated extras - a zombie's 5 percent tool, a fox's 20 percent trinket -
 * and the tiered armor sets. Absent is the safe direction for those to be wrong, and the
 * common vanilla outcome besides.
 *
 * Reading the rest needs a Bedrock loot dialect: the plural arrays, the three chance
 * conditions, `tiers`, and the nested entry `pools` the armor sets chain through. That belongs
 * in `@jsprismarine/loot` beside the Java grammar, not here.
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
 * Whether a pool is one this evaluator can roll without over-rolling it.
 *
 * `conditions` is the plural array the evaluator does not read, so a pool carrying one would
 * roll every time instead of at its stated chance. `tiers` picks among nested tables by a
 * Bedrock-only rule, and a pool carrying one has no `rolls` for the parser to work from.
 * Either way the pool is left out rather than guessed at.
 */
const isPlainPool = (pool: unknown): boolean =>
    pool !== null && typeof pool === 'object' && !('conditions' in pool) && !('tiers' in pool);

/**
 * Every Bedrock loot table with the pools this evaluator cannot gate removed.
 *
 * A rewrite of the JSON rather than a filter at roll time, so the registry compiles and caches
 * each table once the way it does for Java's.
 *
 * @param tables - The Bedrock registry, keyed by the pack-relative path that names a table.
 * @returns The same keys, each table holding only its plain pools.
 */
export const prunedEquipmentTables = (tables: ReadonlyMap<string, unknown>): Map<string, unknown> => {
    const pruned = new Map<string, unknown>();

    for (const [id, entry] of tables) {
        // The loader wraps each file in a record naming its pack and path, which is the shape
        // `packJson` unwraps; the table itself is under `data`.
        const file = entry !== null && typeof entry === 'object' && 'data' in entry ? entry.data : entry;
        if (file === null || typeof file !== 'object' || !('pools' in file) || !Array.isArray(file.pools)) {
            pruned.set(id, file);
            continue;
        }

        pruned.set(id, { ...file, pools: file.pools.filter(isPlainPool) });
    }

    return pruned;
};

/**
 * The evaluator for one content build's equipment tables, built on first use.
 *
 * Keyed by the content rather than rebuilt per roll because compiling a table is the expensive
 * half and `ServerContent` is built once and kept. `LootPackDefinitions` asks for its tables
 * under `lootTablesJava`, so handing it the Bedrock map there is what points the Java evaluator
 * at the Bedrock registry.
 */
const registries = new WeakMap<ServerContent, LootRegistry>();

/** The equipment loot registry for one content build. */
const equipmentRegistry = (content: ServerContent): LootRegistry => {
    const existing = registries.get(content);
    if (existing !== undefined) return existing;

    const registry = new LootRegistry(
        { ...content.definitions, lootTablesJava: prunedEquipmentTables(content.definitions.lootTables) },
        { worldSeed: content.loot.worldSeed }
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
 *   for the five vanilla types whose only pools are the chance-gated ones this evaluator
 *   leaves out - see the note at the top of this file.
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
