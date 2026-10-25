import { describe, expect, it } from 'vitest';

import type { EntityEnvironment, EntityInstance } from '../entityInstance';
import { EntityTypes } from '../entityTypes';

/**
 * The components that count a delay down and then do something, asserted by
 * the component groups their events swap and the sounds they play.
 */

const calf = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:calf' },
        components: { 'minecraft:physics': {} },
        component_groups: {
            'test:baby': {
                'minecraft:is_baby': {},
                'minecraft:ageable': {
                    duration: 2,
                    feed_items: ['wheat'],
                    grow_up: { event: 'test:grown', target: 'self' }
                }
            },
            'test:adult': { 'minecraft:experience_reward': { on_death: '1' } }
        },
        events: {
            'minecraft:entity_spawned': { add: { component_groups: ['test:baby'] } },
            'test:grown': {
                add: { component_groups: ['test:adult'] },
                remove: { component_groups: ['test:baby'] }
            }
        }
    }
};

const bee = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:bee' },
        components: { 'minecraft:physics': {} },
        component_groups: {
            'test:angry': {
                'minecraft:angry': {
                    duration: 1,
                    duration_delta: 0,
                    calm_event: { event: 'test:calmed', target: 'self' }
                }
            }
        },
        events: {
            'test:sting': { add: { component_groups: ['test:angry'] } },
            'test:calmed': { remove: { component_groups: ['test:angry'] } }
        }
    }
};

const chatty = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:chatty' },
        components: {
            'minecraft:ambient_sound_interval': {
                value: 1,
                range: 0,
                event_name: 'ambient',
                event_names: [{ condition: 'query.head_is_in_water', event_name: 'ambient.in.water' }]
            }
        }
    }
};

const quiet = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:quiet' },
        components: { 'minecraft:ambient_sound_interval': { event_name: 'ambient', range: 0, value: 0 } }
    }
};

const spawn = (data: unknown, identifier: string, environment: EntityEnvironment = {}): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn(identifier, { environment });
};

const tick = (entity: EntityInstance, times: number): void => {
    for (let count = 0; count < times; count += 1) entity.tick();
};

/** A world double recording the sounds it is asked to play. */
const sounds = () => {
    const played: string[] = [];
    return { played, effects: { playSound: (_entity: EntityInstance, sound: string) => played.push(sound) } };
};

describe('minecraft:ageable', () => {
    it('grows the baby up after its duration and keeps the feed items readable', () => {
        const entity = spawn(calf, 'test:calf');

        expect(entity.componentParams('minecraft:ageable')).toMatchObject({ feedItems: ['wheat'] });

        tick(entity, 39);

        expect(entity.hasComponent('minecraft:is_baby')).toBe(true);

        tick(entity, 2);

        expect(entity.hasComponent('minecraft:is_baby')).toBe(false);
        expect(entity.activeComponentGroups()).toEqual(['test:adult']);
    });

    it('stops counting once the baby group is gone', () => {
        const reported: string[] = [];
        const entity = spawn(calf, 'test:calf', { report: (message) => reported.push(message) });
        tick(entity, 100);

        expect(reported).toEqual([]);
    });
});

describe('minecraft:angry', () => {
    it('calms down after its duration', () => {
        const entity = spawn(bee, 'test:bee');
        entity.fire('test:sting');
        entity.tick();

        expect(entity.hasComponent('minecraft:angry')).toBe(true);

        tick(entity, 21);

        expect(entity.hasComponent('minecraft:angry')).toBe(false);
    });

    it('reports the anger it cannot broadcast', () => {
        const reported: string[] = [];
        const entity = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:swarm' },
                    components: { 'minecraft:angry': { duration: 25, broadcast_anger: true, broadcast_range: 20 } }
                }
            },
            'test:swarm',
            { report: (message) => reported.push(message) }
        );
        tick(entity, 1);

        expect(reported).toEqual(['minecraft:angry broadcasts anger 20 blocks, which nothing carries out']);
    });
});

describe('minecraft:ambient_sound_interval', () => {
    it('plays its sound every interval', () => {
        const { played, effects } = sounds();
        const entity = spawn(chatty, 'test:chatty', { effects });
        tick(entity, 19);

        expect(played).toEqual([]);

        tick(entity, 1);

        expect(played).toEqual(['ambient']);

        tick(entity, 20);

        expect(played).toEqual(['ambient', 'ambient']);
    });

    it('takes the conditional sound when its Molang holds', () => {
        const { played, effects } = sounds();
        const entity = spawn(chatty, 'test:chatty', {
            effects,
            molang: (source) => source === 'query.head_is_in_water'
        });
        tick(entity, 20);

        expect(played).toEqual(['ambient.in.water']);
    });

    it('plays nothing when the body names no interval', () => {
        const { played, effects } = sounds();
        tick(spawn(quiet, 'test:quiet', { effects }), 200);

        expect(played).toEqual([]);
    });
});
