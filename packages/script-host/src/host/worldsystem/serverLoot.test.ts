import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { SystemScripts } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());

describe.skipIf(!scriptHostAvailable())('world.getLootTableManager()', () => {
    it('reads a table as objects of the classes its JSON names, and rolls loot', () => {
        const { lines } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const manager = world.getLootTableManager();
                const table = manager.getLootTable('entities/pig');
                log('paths', () => [table.path, manager.getLootTable('loot_tables/entities/pig.json') ?? null, manager.getLootTable('entities/pig') === table]);
                const [pool] = table.pools;
                log('pool', () => [pool.rolls, pool.bonusRolls, pool.tiers, pool.conditions.length]);
                const [entry] = pool.entries;
                log('entry', () => [entry.constructor.name, entry.name.id, entry.weight, entry.quality]);
                log('functions', () => entry.functions.map((each) => [each.constructor.name, each.count ?? null, each.conditions.length]));
                const sub = entry.subTable;
                log('sub-table', () => [sub.constructor.name, sub.weight, sub.lootTable.path, sub.lootTable.pools[0].rolls]);
                log('sub-table condition', () => sub.lootTable.pools[0].conditions.map((each) => [each.constructor.name, each.chances]));
                log('roll', () => manager.generateLootFromTable(table).map((stack) => [stack.typeId, stack.amount]));
                log('stone by hand', () => manager.generateLootFromBlockPermutation(BlockPermutation.resolve('stone')));
                log('stone with a tool', () => manager.generateLootFromBlockPermutation(BlockPermutation.resolve('stone'), new ItemStack('minecraft:apple')).map((stack) => stack.typeId));
                log('air', () => manager.generateLootFromBlockPermutation(BlockPermutation.resolve('air')).length);
                log('block type', () => manager.generateLootFromBlockType(BlockPermutation.resolve('oak_log').type).map((stack) => stack.typeId));
                const pig = world.getDimension('overworld').spawnEntity('minecraft:pig', { x: 0, y: 20, z: 0 });
                log('entity', () => manager.generateLootFromEntity(pig).map((stack) => stack.typeId));
            });`
        );
        expect(lines).toEqual([
            'paths ["loot_tables/entities/pig.json",null,false]',
            'pool [{"max":1,"min":1},{"max":0,"min":0},null,0]',
            'entry ["LootItem","minecraft:porkchop",1,0]',
            'functions [["SetItemCountFunction",{"max":3,"min":1},0],["SmeltItemFunction",null,0],["LootingEnchantFunction",{"max":1,"min":0},0]]',
            'sub-table ["LootTableEntry",0,"",{"max":2,"min":2}]',
            'sub-table condition [["RandomDifficultyChanceCondition",[0.5,0.5,0.5,0.6]]]',
            'roll [["minecraft:porkchop",1]]',
            'stone by hand undefined',
            'stone with a tool ["minecraft:stone"]',
            'air 0',
            'block type ["minecraft:oak_log"]',
            'entity ["minecraft:porkchop"]'
        ]);
    });

    it("reads the enchanting functions' levels, treasure and chance", () => {
        const { lines } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const manager = world.getLootTableManager();
                const [withLevels, randomly, randomGear] = manager.getLootTable('chests/enchanted').pools[0].entries[0].functions;
                log('classes', () => [withLevels, randomly, randomGear].map((each) => each.constructor.name));
                log('with levels', () => [withLevels.levels, withLevels.treasure]);
                log('randomly', () => randomly.treasure);
                log('random gear', () => randomGear.chance);
            });`
        );
        expect(lines).toEqual([
            'classes ["EnchantWithLevelsFunction","EnchantRandomlyFunction","EnchantRandomEquipmentFunction"]',
            'with levels [{"max":30,"min":30},true]',
            'randomly false',
            'random gear 0.25'
        ]);
    });
});
