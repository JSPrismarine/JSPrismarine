import { EntityTypes } from '@jsprismarine/entities';
import type { EntityInstance } from '@jsprismarine/entities/entityInstance';
import { describe, expect, it } from 'vitest';

import { withJavaComponentTuning } from './javaComponentTuning';

const entityFile = (identifier: string, components: unknown, groups: unknown = {}) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components,
        component_groups: groups
    }
});

/** Loads one tuned file and spawns its entity, with a fixed random draw and a target at a set distance. */
const spawn = (data: unknown, identifier: string, draw = 0, target?: () => number): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data: withJavaComponentTuning(data), pack: 'test', path: 'entities/test.json' }]);
    return types.spawn(identifier, {
        environment: {
            random: { next: () => draw },
            ...(target === undefined ? {} : { targetProximity: () => ({ id: 1, distance: target(), visible: true }) })
        }
    });
};

/** The ticks left on one component's clock. */
const clock = (entity: EntityInstance, component: string): unknown => {
    const state = entity.componentState.snapshot()[component];
    return typeof state === 'object' && state !== null && 'remaining' in state ? state.remaining : undefined;
};

describe('withJavaComponentTuning', () => {
    it("freezes a skeleton in powder snow after Java's 140 ticks and converts it 300 ticks later", () => {
        const skeleton = entityFile(
            'minecraft:skeleton',
            {},
            {
                in_powder_snow: { 'minecraft:timer': { looping: false, time: 20, time_down_event: { event: 'go' } } },
                become_stray: { 'minecraft:transformation': { into: 'minecraft:stray' } }
            }
        );
        const entity = spawn(skeleton, 'minecraft:skeleton');
        entity.restoreComponentGroups(['in_powder_snow', 'become_stray']);

        expect(clock(entity, 'minecraft:timer')).toBe(140);
        expect(clock(entity, 'minecraft:transformation')).toBe(300);
    });

    it("keeps an angry bee angry Java's 20 to 39 seconds and only in that group", () => {
        const bee = entityFile(
            'minecraft:bee',
            {},
            {
                take_nearest_target: {
                    'minecraft:timer': { looping: true, time: 5, time_down_event: { event: 'calm' } }
                },
                look_for_food: { 'minecraft:timer': { looping: true, time: 180, time_down_event: { event: 'home' } } }
            }
        );
        const angerWith = (draw: number): unknown => {
            const entity = spawn(bee, 'minecraft:bee', draw);
            entity.restoreComponentGroups(['take_nearest_target']);
            return clock(entity, 'minecraft:timer');
        };
        const food = spawn(bee, 'minecraft:bee');
        food.restoreComponentGroups(['look_for_food']);

        expect([angerWith(0), angerWith(1 - Number.EPSILON)]).toEqual([400, 780]);
        expect(clock(food, 'minecraft:timer')).toBe(3600);
    });

    it("sends a wandering trader away after Java's 48000 ticks, never Bedrock's other 72000", () => {
        const trader = entityFile('minecraft:wandering_trader', {
            'minecraft:timer': {
                looping: false,
                random_time_choices: [
                    { value: 2400, weight: 50 },
                    { value: 3600, weight: 50 }
                ],
                time_down_event: { event: 'minecraft:start_despawn' }
            }
        });

        expect(clock(spawn(trader, 'minecraft:wandering_trader', 0.99), 'minecraft:timer')).toBe(48000);
    });

    it('switches a blaze to melee only below 2 blocks and back to fireballs at 2', () => {
        const blaze = entityFile('minecraft:blaze', {
            'minecraft:target_nearby_sensor': {
                inside_range: 2,
                outside_range: 3,
                on_inside_range: { event: 'melee' },
                on_outside_range: { event: 'ranged' }
            }
        });
        let distance = 2;
        const entity = spawn(blaze, 'minecraft:blaze', 0, () => distance);
        const raisedAt = (next: number): readonly (string | undefined)[] => {
            distance = next;
            entity.tick(false);
            const events = entity.queued().map((effects) => effects.event);
            entity.applyQueuedEvents();
            return events;
        };

        expect(raisedAt(2)).toEqual([]);
        expect(raisedAt(1.75)).toEqual(['melee']);
        expect(raisedAt(2)).toEqual(['ranged']);
    });

    it('leaves an entity Java tunes nothing of unchanged', () => {
        const data = entityFile('minecraft:cow', { 'minecraft:timer': { time: 5 } });
        expect(withJavaComponentTuning(data)).toBe(data);
    });
});

describe('withJavaComponentTuning on the frog', () => {
    it("drops the frog's spawn egg interaction, since Java's frog egg makes nothing on a frog", () => {
        const frog = entityFile('minecraft:frog', {
            'minecraft:spawn_egg_interaction': {},
            'minecraft:offspring': { offspring_pairs: { 'minecraft:frog': 'minecraft:tadpole' } }
        });
        const entity = spawn(frog, 'minecraft:frog');

        expect(entity.hasComponent('minecraft:spawn_egg_interaction')).toBe(false);
        expect(
            entity.interactWithItemResult('minecraft:frog_spawn_egg', undefined, {
                loveTicks: 0,
                breedCooldown: 0,
                spawnEgg: { identifier: 'minecraft:frog', offspringIdentifier: 'minecraft:tadpole' }
            })
        ).toBe(false);
    });
});
