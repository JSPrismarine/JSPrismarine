import { describe, expect, it } from 'vitest';

import { blockPropertiesOf, componentValue, defineFamily, familyHooks } from './family';
import { bindFamily, testDefinition } from './harness';
import { DEFAULT_BLOCK_PROPERTIES } from './world';

describe('blockPropertiesOf', () => {
    it('reads the overlay component rather than a built-in number', () => {
        const definition = testDefinition('minecraft:blue_ice', {
            'jsprismarine:block_properties': {
                friction: 0.989,
                random_tick: false,
                requires_correct_tool: false,
                push_reaction: 'immovable',
                source: 'java'
            }
        });

        expect(blockPropertiesOf(definition)).toMatchObject({ friction: 0.989, pushReaction: 'immovable' });
    });

    it('falls back to the component defaults when the block carries no properties', () => {
        expect(blockPropertiesOf(testDefinition('minecraft:stone'))).toEqual(DEFAULT_BLOCK_PROPERTIES);
    });

    it('falls back to the defaults when the value does not parse', () => {
        const definition = testDefinition('minecraft:stone', { 'jsprismarine:block_properties': { friction: 'fast' } });

        expect(blockPropertiesOf(definition)).toEqual(DEFAULT_BLOCK_PROPERTIES);
    });

    it('reads a definition whose data is not a block document as having no components', () => {
        expect(componentValue({ ...testDefinition('minecraft:stone'), data: 7 }, 'minecraft:friction')).toBeUndefined();
    });
});

describe('defineFamily', () => {
    const family = defineFamily('jsprismarine:test', 'A family that answers one interaction.', {
        onPlayerInteract: (event, world) => {
            world.playSound(event.block.position, 'test.use');
            return true;
        }
    });

    it('declares exactly the hooks its handlers implement', () => {
        expect(familyHooks(family)).toEqual(['onPlayerInteract']);
    });

    it('hands the handler the world for the event block dimension', () => {
        const harness = bindFamily(family, 'minecraft:stone', { dimension: 'minecraft:nether' });
        harness.dimension.set({ x: 1, y: 2, z: 3 }, 'minecraft:stone');

        expect(harness.interact({ x: 1, y: 2, z: 3 })).toBe(true);
        expect(harness.dimension.sounds).toEqual([{ position: { x: 1, y: 2, z: 3 }, name: 'test.use' }]);
        expect(harness.world.overworld.sounds).toEqual([]);
    });

    it('routes named entity events through the family and its block dimension', () => {
        const family = defineFamily('jsprismarine:home_block', 'Handles entity events on the block.', {
            onEntity: (event, world) => world.playSound(event.block.position, event.name)
        });
        const harness = bindFamily(family, 'minecraft:stone', { dimension: 'minecraft:nether' });
        harness.dimension.set({ x: 1, y: 2, z: 3 }, 'minecraft:stone');

        harness.entityEvent({ x: 1, y: 2, z: 3 }, 'kennel:upgrade', {
            identifier: 'minecraft:wolf',
            position: { x: 1, y: 2, z: 3 }
        });

        expect(harness.dimension.sounds).toEqual([{ position: { x: 1, y: 2, z: 3 }, name: 'kennel:upgrade' }]);
        expect(harness.world.overworld.sounds).toEqual([]);
    });
});
