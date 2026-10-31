import { describe, expect, it } from 'vitest';

import {
    bedrockBlockEntityIdForJavaType,
    bedrockBlockEntityIdOf,
    javaBlockEntityTypeForBedrockBlock,
    javaBlockEntityTypesWithBedrockIds
} from './bedrockBlockEntityIds';

describe('bedrockBlockEntityIdOf', () => {
    it('answers for a block whose id is its own name', () => {
        expect(bedrockBlockEntityIdOf('minecraft:barrel')).toBe('Barrel');
        expect(bedrockBlockEntityIdOf('minecraft:trial_spawner')).toBe('TrialSpawner');
        expect(bedrockBlockEntityIdOf('minecraft:vault')).toBe('Vault');
    });

    it('takes a bare name as well as a namespaced one', () => {
        expect(bedrockBlockEntityIdOf('decorated_pot')).toBe('DecoratedPot');
    });

    it('collapses the variants of a block onto the one id Bedrock files them under', () => {
        for (const wood of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'cherry', 'bamboo', 'warped']) {
            expect(bedrockBlockEntityIdOf(`minecraft:${wood}_standing_sign`), wood).toBe('Sign');
            expect(bedrockBlockEntityIdOf(`minecraft:${wood}_wall_sign`), wood).toBe('Sign');
        }
        for (const color of ['black', 'light_blue', 'undyed']) {
            expect(bedrockBlockEntityIdOf(`minecraft:${color}_shulker_box`), color).toBe('ShulkerBox');
        }
        for (const stage of ['copper_chest', 'waxed_oxidized_copper_chest', 'weathered_copper_chest']) {
            expect(bedrockBlockEntityIdOf(`minecraft:${stage}`), stage).toBe('Chest');
        }
    });

    it('has no answer for a block Bedrock keeps no block entity on', () => {
        expect(bedrockBlockEntityIdOf('minecraft:stone')).toBeUndefined();
        expect(bedrockBlockEntityIdOf('minecraft:bookshelf')).toBeUndefined();
        expect(bedrockBlockEntityIdOf('minecraft:shelf_mushroom')).toBeUndefined();
    });
});

describe('bedrockBlockEntityIdForJavaType', () => {
    it('names the types a generated structure carries', () => {
        expect(bedrockBlockEntityIdForJavaType('minecraft:chest')).toBe('Chest');
        expect(bedrockBlockEntityIdForJavaType('minecraft:trapped_chest')).toBe('Chest');
        expect(bedrockBlockEntityIdForJavaType('minecraft:mob_spawner')).toBe('MobSpawner');
        expect(bedrockBlockEntityIdForJavaType('minecraft:trial_spawner')).toBe('TrialSpawner');
        expect(bedrockBlockEntityIdForJavaType('minecraft:vault')).toBe('Vault');
        expect(bedrockBlockEntityIdForJavaType('minecraft:brushable_block')).toBe('BrushableBlock');
    });

    it('covers every Java 26.3 block entity type Bedrock has a counterpart for', () => {
        // The whole registry, from Mojang's own `block_entity_type` report. The three left out
        // are the ones Bedrock does not have: a type that reappears here is a block entity a
        // generated structure would otherwise drop.
        expect([...javaBlockEntityTypesWithBedrockIds()].sort()).toEqual(
            [
                'minecraft:banner',
                'minecraft:barrel',
                'minecraft:beacon',
                'minecraft:beehive',
                'minecraft:bell',
                'minecraft:blast_furnace',
                'minecraft:brewing_stand',
                'minecraft:brushable_block',
                'minecraft:calibrated_sculk_sensor',
                'minecraft:campfire',
                'minecraft:chest',
                'minecraft:chiseled_bookshelf',
                'minecraft:command_block',
                'minecraft:comparator',
                'minecraft:conduit',
                'minecraft:copper_golem_statue',
                'minecraft:crafter',
                'minecraft:creaking_heart',
                'minecraft:daylight_detector',
                'minecraft:decorated_pot',
                'minecraft:dispenser',
                'minecraft:dropper',
                'minecraft:enchanting_table',
                'minecraft:end_gateway',
                'minecraft:end_portal',
                'minecraft:ender_chest',
                'minecraft:furnace',
                'minecraft:hanging_sign',
                'minecraft:hopper',
                'minecraft:jigsaw',
                'minecraft:jukebox',
                'minecraft:lectern',
                'minecraft:mob_spawner',
                'minecraft:piston',
                'minecraft:sculk_catalyst',
                'minecraft:sculk_sensor',
                'minecraft:sculk_shrieker',
                'minecraft:shelf',
                'minecraft:shulker_box',
                'minecraft:sign',
                'minecraft:skull',
                'minecraft:smoker',
                'minecraft:structure_block',
                'minecraft:trapped_chest',
                'minecraft:trial_spawner',
                'minecraft:vault'
            ].sort()
        );
    });

    it('files an item frame under the block entity Bedrock keeps where Java keeps an entity', () => {
        // An end city hangs its elytra in one. Java's is an entity and therefore not in the
        // block entity registry, so it is answered here and left out of the registry list above.
        expect(bedrockBlockEntityIdForJavaType('minecraft:item_frame')).toBe('ItemFrame');
        expect(javaBlockEntityTypesWithBedrockIds()).not.toContain('minecraft:item_frame');
    });

    it('has no answer for a Java type Bedrock does not have', () => {
        expect(bedrockBlockEntityIdForJavaType('minecraft:potent_sulfur')).toBeUndefined();
        expect(bedrockBlockEntityIdForJavaType('minecraft:test_block')).toBeUndefined();
    });
});

describe('javaBlockEntityTypeForBedrockBlock', () => {
    it('names the type for the block a structure processor gives a loot table to', () => {
        // Both suspicious blocks, because an `append_loot` rule names the block and never the
        // type, and a trail ruins gravel and a desert well sand go through the same rule shape.
        expect(javaBlockEntityTypeForBedrockBlock('minecraft:suspicious_gravel')).toBe('minecraft:brushable_block');
        expect(javaBlockEntityTypeForBedrockBlock('suspicious_sand')).toBe('minecraft:brushable_block');
        expect(javaBlockEntityTypeForBedrockBlock('minecraft:barrel')).toBe('minecraft:barrel');
        expect(javaBlockEntityTypeForBedrockBlock('minecraft:oak_wall_sign')).toBe('minecraft:sign');
    });

    it('round trips back to the id Bedrock files the block under', () => {
        for (const block of ['minecraft:chest', 'minecraft:trapped_chest', 'minecraft:lit_furnace', 'bamboo_shelf']) {
            const javaType = javaBlockEntityTypeForBedrockBlock(block);

            // What the answer is for. The type goes into a block entity request and comes back
            // out as an id. Two Java chests share one Bedrock id, so the tie cannot be read off
            // the type, and this is the property that has to hold instead.
            expect(javaType === undefined ? undefined : bedrockBlockEntityIdForJavaType(javaType), block).toBe(
                bedrockBlockEntityIdOf(block)
            );
        }
    });

    it('has no answer for a block one edition or the other keeps no block entity on', () => {
        expect(javaBlockEntityTypeForBedrockBlock('minecraft:stone')).toBeUndefined();
        // Bedrock files a block entity on both; Java keeps neither in `block_entity_type`.
        expect(javaBlockEntityTypeForBedrockBlock('minecraft:bed')).toBeUndefined();
        expect(javaBlockEntityTypeForBedrockBlock('minecraft:flower_pot')).toBeUndefined();
    });
});
