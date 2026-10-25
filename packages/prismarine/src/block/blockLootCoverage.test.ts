import { vanillaBlockPalette } from '@jsprismarine/blocks';
import { BEDROCK_ONLY_BLOCKS } from '@jsprismarine/mapping';
import { load } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import { blockLootTableOf, rollBlockDrops } from './blockLoot';

/**
 * Walks the whole Bedrock palette against the real Java 26.3 block tables and
 * holds the set of blocks that resolve none. It needs the datapack that
 * `pnpm --filter @jsprismarine/bedrock-data run datagen:java` extracts, so it
 * only runs with JSP_VANILLA_DATAPACK pointing at it.
 *
 * The gap this guards used to be 356 of the 1477 palette blocks, because the
 * index resolved each Java table forward through the block's default state and
 * so never learned the identifiers Bedrock splits off from a non-default one.
 */

const datapack = process.env['JSP_VANILLA_DATAPACK'];

/**
 * Palette blocks that resolve no table and should not: Java publishes no table
 * for the block behind them either, and breaking one yields nothing in Java.
 *
 * Air, lava and water are not blocks a player breaks. Bedrock, the barrier, the
 * three command blocks, the jigsaw, the structure block and void, the light
 * block and the end portal, its frame and the gateway are unobtainable, and
 * Java gives none of them a table. `minecraft:moving_block` and the two piston
 * arms are Bedrock's halves of Java's `moving_piston` and `piston_head`, which
 * exist for the length of a push. `minecraft:unknown` is where the two Java
 * test blocks land.
 */
const DROPS_NOTHING = [
    'minecraft:air',
    'minecraft:barrier',
    'minecraft:bedrock',
    'minecraft:bubble_column',
    'minecraft:chain_command_block',
    'minecraft:command_block',
    'minecraft:end_gateway',
    'minecraft:end_portal',
    'minecraft:end_portal_frame',
    'minecraft:flowing_lava',
    'minecraft:flowing_water',
    'minecraft:jigsaw',
    'minecraft:lava',
    'minecraft:light_block_0',
    'minecraft:light_block_1',
    'minecraft:light_block_10',
    'minecraft:light_block_11',
    'minecraft:light_block_12',
    'minecraft:light_block_13',
    'minecraft:light_block_14',
    'minecraft:light_block_15',
    'minecraft:light_block_2',
    'minecraft:light_block_3',
    'minecraft:light_block_4',
    'minecraft:light_block_5',
    'minecraft:light_block_6',
    'minecraft:light_block_7',
    'minecraft:light_block_8',
    'minecraft:light_block_9',
    'minecraft:moving_block',
    'minecraft:piston_arm_collision',
    'minecraft:repeating_command_block',
    'minecraft:sticky_piston_arm_collision',
    'minecraft:structure_block',
    'minecraft:structure_void',
    'minecraft:unknown',
    'minecraft:water'
] as const;

/**
 * Palette blocks that drop something in both editions and resolve no table
 * here, because Java publishes none for them.
 *
 * Java's 85 tableless blocks include 62 that reuse another block's table
 * through `BlockBehaviour.Properties.dropsLike` rather than carrying one of
 * their own: a wall sign drops the standing sign, a coral wall fan the coral
 * fan, a wall banner the banner. Most of the 62 are invisible here, because
 * Bedrock spells them as a state of the block they drop; these are the ones
 * Bedrock gives an identifier of its own, so nothing in the mapping connects
 * them to a table. The rule lives in Java's code and in no data file, so
 * closing this needs a source the loot path does not have yet.
 */
const JAVA_PUBLISHES_NO_TABLE = [
    'minecraft:acacia_wall_sign',
    'minecraft:bamboo_wall_sign',
    'minecraft:birch_wall_sign',
    'minecraft:brain_coral_wall_fan',
    'minecraft:bubble_coral_wall_fan',
    'minecraft:cherry_wall_sign',
    'minecraft:crimson_wall_sign',
    'minecraft:darkoak_wall_sign',
    'minecraft:dead_brain_coral_wall_fan',
    'minecraft:dead_bubble_coral_wall_fan',
    'minecraft:dead_fire_coral_wall_fan',
    'minecraft:dead_horn_coral_wall_fan',
    'minecraft:dead_tube_coral_wall_fan',
    'minecraft:fire_coral_wall_fan',
    'minecraft:horn_coral_wall_fan',
    'minecraft:jungle_wall_sign',
    'minecraft:mangrove_wall_sign',
    'minecraft:pale_oak_wall_sign',
    'minecraft:poplar_wall_sign',
    'minecraft:spruce_wall_sign',
    'minecraft:tube_coral_wall_fan',
    'minecraft:wall_banner',
    'minecraft:wall_sign',
    'minecraft:warped_wall_sign'
] as const;

/** The vanilla block tables, in a stack that holds nothing else of interest. */
const vanillaBlockTables = () =>
    buildServerContent(
        fixtureContentOptions({
            load: () => ({
                definitions: {
                    ...fixtureDefinitions(),
                    lootTablesJava: load([{ kind: 'datapack', path: datapack ?? '' }]).definitions.lootTablesJava
                },
                diagnostics: []
            })
        })
    );

describe.skipIf(!datapack)('every block of the Bedrock palette, against the Java 26.3 tables', () => {
    it('resolves a table for all but the reviewed blocks that drop nothing', () => {
        const content = vanillaBlockTables();

        const unresolved = vanillaBlockPalette()
            .entries.map((entry) => entry.identifier)
            .filter((identifier) => blockLootTableOf(content, identifier) === undefined);

        // The 182 Bedrock-only blocks are the generated list rather than a
        // hand-kept one: the chemistry set, the hard glass, the deprecated
        // palette entries and the rest that no Java block state reaches.
        expect(unresolved.filter((identifier) => BEDROCK_ONLY_BLOCKS.has(identifier))).toHaveLength(182);
        expect(unresolved.filter((identifier) => !BEDROCK_ONLY_BLOCKS.has(identifier))).toEqual(
            [...DROPS_NOTHING, ...JAVA_PUBLISHES_NO_TABLE].sort()
        );
        expect(unresolved).toHaveLength(243);
    });

    it('resolves the tables of the blocks Bedrock splits off from a non-default state', () => {
        const content = vanillaBlockTables();

        // One of each shape the split takes: a double slab, a lit machine, a
        // powered diode and a berried vine. All of them dropped nothing while
        // the index only knew what a Java block's default state mapped to.
        expect(blockLootTableOf(content, 'minecraft:black_concrete_double_slab')).toBe(
            'minecraft:blocks/black_concrete_slab'
        );
        expect(blockLootTableOf(content, 'minecraft:double_cut_copper_slab')).toBe('minecraft:blocks/cut_copper_slab');
        expect(blockLootTableOf(content, 'minecraft:lit_furnace')).toBe('minecraft:blocks/furnace');
        expect(blockLootTableOf(content, 'minecraft:powered_repeater')).toBe('minecraft:blocks/repeater');
        expect(blockLootTableOf(content, 'minecraft:cave_vines_head_with_berries')).toBe('minecraft:blocks/cave_vines');
    });

    it('rolls the real tables of the two blocks the state decides the count of', () => {
        const content = vanillaBlockTables();

        // `minecraft:blocks/black_concrete_slab` sets the count to 2 behind a
        // match_block on `type=double`, and `minecraft:blocks/shelf_mushroom`
        // behind one on `age=1`. Neither branch can be taken without the Java
        // state, and the double slab could not reach its table at all.
        expect(
            rollBlockDrops(content, {
                identifier: 'minecraft:black_concrete_double_slab',
                states: { 'minecraft:vertical_half': 'bottom' }
            })
        ).toEqual([{ identifier: 'minecraft:black_concrete_slab', count: 2 }]);
        expect(
            rollBlockDrops(content, {
                identifier: 'minecraft:black_concrete_slab',
                states: { 'minecraft:vertical_half': 'top' }
            })
        ).toEqual([{ identifier: 'minecraft:black_concrete_slab', count: 1 }]);

        expect(
            rollBlockDrops(content, {
                identifier: 'minecraft:shelf_mushroom',
                states: { growth: 1, 'minecraft:cardinal_direction': 'west' }
            })
        ).toEqual([{ identifier: 'minecraft:shelf_mushroom', count: 2 }]);
        expect(
            rollBlockDrops(content, {
                identifier: 'minecraft:shelf_mushroom',
                states: { growth: 0, 'minecraft:cardinal_direction': 'west' }
            })
        ).toEqual([{ identifier: 'minecraft:shelf_mushroom', count: 1 }]);
    });
});
