/**
 * The `loot-tables` scenario: `world.getLootTableManager()` reads the behavior pack's loot tables
 * as objects, a pool, an entry, a function and a condition each reporting the properties of its
 * class, and generates loot from a table, a block and an entity. A roll is random, so the record
 * keeps which item types a roll can give rather than how many.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, ItemStack, system, world } from '@minecraft/server';

const PACK = 'loot';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Runs `run` once the chunk at the origin is loaded, adding a ticking area for BDS. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run();
        }, 1);
    });
};

/** A float the way the record keeps it. */
const round = (value) => (typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value);

/**
 * The loot classes whose members the enchantment and entity variant work covers, which this
 * scenario names without reading.
 */
const NAMED_ONLY = new Set([
    'EnchantInfo',
    'EnchantRandomEquipmentFunction',
    'EnchantRandomlyFunction',
    'EnchantWithLevelsFunction',
    'EntityHasVariantCondition',
    'EntityHasMarkVariantCondition'
]);

/**
 * Any loot object as plain data: its class, and each property its class and the classes it
 * extends declare, read through the API.
 */
const describe = (value, depth = 0) => {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return round(value);
    if (Array.isArray(value)) return value.map((each) => describe(each, depth));
    const prototype = Object.getPrototypeOf(value);
    const name = prototype?.constructor?.name;
    if (name === 'Object' || name === undefined) {
        return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, describe(each, depth)]));
    }
    if (name === 'ItemType' || name === 'BlockType' || name === 'EntityType') return `${name} ${value.id}`;
    if (name === 'LootTable' && depth > 0) return `LootTable ${value.path}`;
    const described = { class: name };
    if (NAMED_ONLY.has(name)) return described;
    for (let at = prototype; at !== null && at !== Object.prototype; at = Object.getPrototypeOf(at)) {
        for (const key of Object.getOwnPropertyNames(at)) {
            if (key === 'constructor' || key in described) continue;
            const property = Object.getOwnPropertyDescriptor(at, key);
            if (property?.get === undefined) continue;
            try {
                described[key] = describe(value[key], depth + 1);
            } catch (error) {
                described[key] = `throws ${String(error)}`;
            }
        }
    }
    return described;
};

/** The item types a roll gave, sorted and without repeats. */
const types = (stacks) =>
    stacks === undefined ? 'undefined' : [...new Set(stacks.map((stack) => stack.typeId))].sort();

const TABLES = [
    'entities/pig',
    'entities/zombie',
    'entities/ghast',
    'entities/creeper',
    'entities/frog',
    'entities/husk_rider',
    'entities/piglin_gear_melee',
    'entities/armor_set_chain',
    'entities/pillager_captain_equipment',
    'entities/bogged',
    'equipment/trial_chamber_chainmail',
    'chests/shipwreck',
    'chests/shipwrecksupply',
    'chests/trial_chambers/reward',
    'chests/trial_chambers/reward_common',
    'chests/ancient_city',
    'chests/abandoned_mineshaft',
    'blocks/black_concrete_slab',
    'gameplay/entities/mooshroom_milking'
];

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const manager = world.getLootTableManager();
    attempt('getLootTableManager is the same object', () => world.getLootTableManager() === manager);
    for (const path of [
        'loot_tables/entities/pig.json',
        'entities/pig',
        'entities/pig.json',
        'loot_tables/entities/pig',
        'jsp/missing'
    ]) {
        attempt(`getLootTable ${path}`, () => manager.getLootTable(path)?.path ?? null);
    }
    attempt(
        'getLootTable is a new object',
        () => manager.getLootTable('entities/pig') === manager.getLootTable('entities/pig')
    );
    for (const path of TABLES) attempt(`table ${path}`, () => describe(manager.getLootTable(path)));

    attempt('generateLootFromTable', () => types(manager.generateLootFromTable(manager.getLootTable('entities/pig'))));
    attempt('generateLootFromBlockPermutation dirt', () =>
        manager
            .generateLootFromBlockPermutation(BlockPermutation.resolve('minecraft:dirt'))
            ?.map((stack) => [stack.typeId, stack.amount])
    );
    attempt('generateLootFromBlockPermutation grass', () =>
        types(manager.generateLootFromBlockPermutation(BlockPermutation.resolve('minecraft:grass_block')))
    );
    attempt('generateLootFromBlockPermutation stone', () =>
        types(manager.generateLootFromBlockPermutation(BlockPermutation.resolve('minecraft:stone')))
    );
    attempt('generateLootFromBlockPermutation stone with a pickaxe', () =>
        types(
            manager.generateLootFromBlockPermutation(
                BlockPermutation.resolve('minecraft:stone'),
                new ItemStack('minecraft:iron_pickaxe')
            )
        )
    );
    attempt('generateLootFromBlockPermutation air', () =>
        types(manager.generateLootFromBlockPermutation(BlockPermutation.resolve('minecraft:air')))
    );
    attempt('generateLootFromBlockType', () =>
        types(manager.generateLootFromBlockType(BlockPermutation.resolve('minecraft:oak_log').type))
    );
    attempt('generateLootFromBlock', () => {
        overworld.setBlockType({ x: 3, y: 20, z: 3 }, 'minecraft:oak_planks');
        return types(manager.generateLootFromBlock(overworld.getBlock({ x: 3, y: 20, z: 3 })));
    });
    attempt('generateLootFromEntity', () => {
        const pig = overworld.spawnEntity('minecraft:pig', { x: 5.5, y: 20, z: 5.5 });
        const loot = types(manager.generateLootFromEntity(pig));
        pig.remove();
        return loot;
    });
    attempt('generateLootFromEntity of an armor stand', () => {
        const stand = overworld.spawnEntity('minecraft:armor_stand', { x: 5.5, y: 20, z: 5.5 });
        const loot = types(manager.generateLootFromEntity(stand));
        stand.remove();
        return loot;
    });
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 1);
});
