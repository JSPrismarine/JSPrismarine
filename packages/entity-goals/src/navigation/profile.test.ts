import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';

import { navigationProfile } from './profile';

describe('navigationProfile', () => {
    it('keeps string and named block entries while skipping invalid values', () => {
        const entity = new GoalHarness({
            goals: {},
            components: {
                'minecraft:navigation.walk': {
                    blocks_to_avoid: ['minecraft:cactus', { name: 'minecraft:lava' }, 12, { name: 12 }]
                }
            }
        }).entity;

        expect(navigationProfile(entity).blocksToAvoid).toEqual(['minecraft:cactus', 'minecraft:lava']);
    });

    it('keeps one named block entry', () => {
        const entity = new GoalHarness({
            goals: {},
            components: {
                'minecraft:navigation.walk': { blocks_to_avoid: { name: 'minecraft:cactus' } }
            }
        }).entity;

        expect(navigationProfile(entity).blocksToAvoid).toEqual(['minecraft:cactus']);
    });
});
