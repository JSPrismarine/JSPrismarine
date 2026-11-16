import { BRAIN_MOBS, TADPOLE_GOALS } from '@jsprismarine/entity-brains';
import { describe, expect, it } from 'vitest';

import { brainGoalsOf, withBrainGoals } from './brainGoals';

/** An entity file shaped like Bedrock's tadpole: goals in its base components and in a group. */
const entityFile = (identifier: string) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components: {
            'minecraft:health': { value: 6, max: 6 },
            'minecraft:behavior.panic': { priority: 1, speed_multiplier: 2 },
            'minecraft:behavior.tempt': { priority: 5, items: ['slime_ball'] },
            'minecraft:behavior.look_at_player': { priority: 3 }
        },
        component_groups: {
            adult: { 'minecraft:behavior.random_swim': { priority: 2, interval: 100 }, 'minecraft:scale': { value: 1 } }
        }
    }
});

describe('withBrainGoals', () => {
    const goals = brainGoalsOf(BRAIN_MOBS);

    it("runs exactly the tadpole's Java fish goals in place of the goals its file declares", () => {
        const data = withBrainGoals(entityFile('minecraft:tadpole'), goals);

        expect(data).toEqual({
            format_version: '1.21.0',
            'minecraft:entity': {
                description: { identifier: 'minecraft:tadpole', is_spawnable: true, is_summonable: true },
                components: { 'minecraft:health': { value: 6, max: 6 }, ...TADPOLE_GOALS },
                component_groups: { adult: { 'minecraft:scale': { value: 1 } } }
            }
        });
    });

    it('leaves a mob whose brain names no goals of its own as its file wrote it', () => {
        const camel = entityFile('minecraft:camel');
        const zombie = entityFile('minecraft:zombie');

        expect(withBrainGoals(camel, goals)).toBe(camel);
        expect(withBrainGoals(zombie, goals)).toBe(zombie);
    });
});
