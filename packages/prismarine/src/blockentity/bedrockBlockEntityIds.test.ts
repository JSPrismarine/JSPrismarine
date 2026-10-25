import { describe, expect, it } from 'vitest';

import {
    bedrockBlockEntityIdForJavaType,
    bedrockBlockEntityIdOf,
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

    it('has no answer for a Java type Bedrock does not have', () => {
        expect(bedrockBlockEntityIdForJavaType('minecraft:potent_sulfur')).toBeUndefined();
        expect(bedrockBlockEntityIdForJavaType('minecraft:test_block')).toBeUndefined();
    });
});
