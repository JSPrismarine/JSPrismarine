import { describe, expect, it } from 'vitest';

import { canEntityAttack, canEntityAttackView } from './vanilla';
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
                    duration: 20,
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

        tick(entity, 399);

        expect(entity.hasComponent('minecraft:is_baby')).toBe(true);

        tick(entity, 2);

        expect(entity.hasComponent('minecraft:is_baby')).toBe(false);
        expect(entity.activeComponentGroups()).toEqual(['test:adult']);
    });

    it('stops counting once the baby group is gone', () => {
        const reported: string[] = [];
        const entity = spawn(calf, 'test:calf', { report: (message) => reported.push(message) });
        tick(entity, 500);

        expect(reported).toEqual([]);
    });

    it('advances the timer by the default tenth when fed a string item', () => {
        const entity = spawn(calf, 'test:calf');

        expect(entity.interactWithItem('minecraft:stick')).toBe(false);
        expect(entity.interactWithItem('wheat')).toBe(true);
        expect(entity.interactWithItem('wheat')).toBe(true);

        tick(entity, 340);
        expect(entity.hasComponent('minecraft:is_baby')).toBe(true);

        tick(entity, 1);
        expect(entity.hasComponent('minecraft:is_baby')).toBe(false);
    });

    it('keeps a baby forever when duration is -1', () => {
        const entity = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:permanent_baby' },
                    component_groups: {
                        baby: {
                            'minecraft:is_baby': {},
                            'minecraft:ageable': {
                                duration: -1,
                                grow_up: { event: 'test:grown', target: 'self' }
                            }
                        },
                        adult: {}
                    },
                    events: {
                        'minecraft:entity_spawned': { add: { component_groups: ['baby'] } },
                        'test:grown': {
                            add: { component_groups: ['adult'] },
                            remove: { component_groups: ['baby'] }
                        }
                    }
                }
            },
            'test:permanent_baby'
        );

        tick(entity, 24_000);

        expect(entity.hasComponent('minecraft:is_baby')).toBe(true);
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

    it('excludes targets matching its filters while angry', () => {
        const attacker = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:attacker' },
                    components: {
                        'minecraft:angry': {
                            filters: { test: 'is_family', subject: 'other', value: 'villager' }
                        }
                    }
                }
            },
            'test:attacker'
        );
        const villager = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:villager' },
                    components: { 'minecraft:type_family': { family: ['villager'] } }
                }
            },
            'test:villager'
        );

        expect(canEntityAttack(attacker, villager)).toBe(false);
        expect(
            canEntityAttackView(attacker, { names: (name) => (name === 'is_family' ? ['villager'] : undefined) })
        ).toBe(false);
    });

    it('broadcasts to the attack target when configured', () => {
        const broadcasts: unknown[] = [];
        const target = { id: () => 42 };
        const entity = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:attacker' },
                    components: {
                        'minecraft:angry': { broadcast_anger_on_attack: true, broadcast_range: 12 }
                    }
                }
            },
            'test:attacker',
            { broadcastAnger: (_source, request) => broadcasts.push(request) }
        );

        entity.notifyAttack(target);

        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]).toMatchObject({ range: 12, target });
    });

    it('broadcasts when damaged and on death unless death broadcasts are disabled', () => {
        const broadcasts: unknown[] = [];
        const target = { id: () => 42 };
        const environment = { broadcastAnger: (_source: EntityInstance, request: unknown) => broadcasts.push(request) };
        const attacked = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:attacked' },
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:angry': { broadcast_anger_on_being_attacked: true }
                    }
                }
            },
            'test:attacked',
            environment
        );
        attacked.damage({ cause: 'entity_attack', amount: 1, damager: target });
        expect(broadcasts).toHaveLength(1);
        expect(broadcasts[0]).toMatchObject({ target });

        broadcasts.length = 0;
        const dying = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:dying' },
                    components: {
                        'minecraft:health': { value: 1, max: 1 },
                        'minecraft:angry': { broadcast_anger_when_dying: false }
                    }
                }
            },
            'test:dying',
            environment
        );
        expect(dying.damage({ cause: 'entity_attack', amount: 1, damager: target }).died).toBe(true);
        expect(broadcasts).toEqual([]);
    });

    it('broadcasts on death by default', () => {
        const broadcasts: unknown[] = [];
        const entity = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:dying' },
                    components: {
                        'minecraft:health': { value: 1, max: 1 },
                        'minecraft:angry': {}
                    }
                }
            },
            'test:dying',
            { broadcastAnger: (_source, request) => broadcasts.push(request) }
        );

        entity.damage({ cause: 'entity_attack', amount: 1 });

        expect(broadcasts).toHaveLength(1);
    });

    it('plays angry_sound immediately and repeats at the configured interval', () => {
        const { played, effects } = sounds();
        const entity = spawn(
            {
                format_version: '1.26.50',
                'minecraft:entity': {
                    description: { identifier: 'test:angry_sound' },
                    components: {
                        'minecraft:angry': { duration: 5, angry_sound: 'mob.angry', sound_interval: [1, 1] }
                    }
                }
            },
            'test:angry_sound',
            { effects }
        );

        expect(played).toEqual(['mob.angry']);
        tick(entity, 19);
        expect(played).toEqual(['mob.angry']);
        tick(entity, 1);
        expect(played).toEqual(['mob.angry', 'mob.angry']);
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
