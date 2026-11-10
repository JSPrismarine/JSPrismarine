import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from '../componentState';
import { observing, slotOf, tickThenUndo } from '../componentState.test.helper';
import type { EntityEnvironment, EntityInstance, TransformRequest } from '../entityInstance';
import { EntityTypes } from '../entityTypes';
import type { EntitySpawnRequest } from '../hooks';

/**
 * The clock components of `lifecycle.ts`, asserted through the state they keep on the instance:
 * each write reaches the host with its before and after values, and writing the before-values
 * back puts the slot where it was.
 */

const entity = (identifier: string, components: Record<string, unknown>) => ({
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier },
        components,
        events: { 'test:rang': {} }
    }
});

const alarm = entity('test:alarm', {
    'minecraft:timer': { looping: false, time: 1, time_down_event: { event: 'test:rang', target: 'self' } }
});

const hen = entity('test:hen', {
    'minecraft:spawn_entity': {
        entities: [{ spawn_item: 'egg', min_wait_time: 1, max_wait_time: 1, single_use: true }]
    }
});

const calf = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:calf' },
        component_groups: {
            'test:baby': {
                'minecraft:ageable': {
                    duration: 20,
                    feed_items: ['wheat'],
                    pause_growth_items: ['minecraft:golden_dandelion']
                }
            }
        },
        events: { 'minecraft:entity_spawned': { add: { component_groups: ['test:baby'] } } }
    }
};

const chatty = entity('test:chatty', { 'minecraft:ambient_sound_interval': { value: 1, range: 0 } });

const husk = entity('test:husk', { 'minecraft:transformation': { into: 'minecraft:zombie', delay: 1 } });

const spawn = (data: unknown, identifier: string, environment: EntityEnvironment = {}): EntityInstance => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'vanilla', path: 'entities/test.json' }]);
    return types.spawn(identifier, { environment });
};

const tick = (instance: EntityInstance, times: number): void => {
    for (let count = 0; count < times; count += 1) instance.tick();
};

describe('minecraft:timer state', () => {
    it('counts down through the slot, fires once and leaves no state behind', () => {
        const writes: ComponentStateWrite[] = [];
        const instance = spawn(alarm, 'test:alarm', observing(writes));

        expect(slotOf(instance)).toEqual({ 'minecraft:timer': { remaining: 20 } });

        tick(instance, 19);
        expect(slotOf(instance)).toEqual({ 'minecraft:timer': { remaining: 1 } });

        writes.length = 0;
        tick(instance, 1);
        expect(writes).toEqual([{ component: 'minecraft:timer', before: { remaining: 1 }, after: null }]);
        expect(instance.componentState.snapshot()).toEqual({ 'minecraft:timer': null });
    });

    it('returns to the exact slot when a tick that fired it is undone', () => {
        const writes: ComponentStateWrite[] = [];
        const instance = spawn(alarm, 'test:alarm', observing(writes));
        tick(instance, 15);
        const run = tickThenUndo(instance, writes, 10);

        expect(run.ticked).toEqual({});
        expect(run.undone).toEqual(run.before);
    });
});

describe('minecraft:spawn_entity state', () => {
    it('spawns a single-use entry once and records it as used', () => {
        const requests: EntitySpawnRequest[] = [];
        const instance = spawn(hen, 'test:hen', {
            spawnEntity: (_entity, request) => requests.push(request) > 0
        });
        tick(instance, 60);

        expect(requests).toHaveLength(1);
        expect(slotOf(instance)).toEqual({ 'minecraft:spawn_entity': { remaining: [0], used: [true] } });
    });

    it('reports its countdown and undoes it exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const instance = spawn(hen, 'test:hen', observing(writes, { spawnEntity: () => true }));
        const run = tickThenUndo(instance, writes, 25);

        expect(run.writes[0]).toEqual({
            component: 'minecraft:spawn_entity',
            before: { remaining: [20], used: [false] },
            after: { remaining: [19], used: [false] }
        });
        expect(run.ticked).toEqual({ 'minecraft:spawn_entity': { remaining: [0], used: [true] } });
        expect(run.undone).toEqual(run.before);
    });
});

describe('minecraft:ageable state', () => {
    it('reports a pause item as a write of the growth state', () => {
        const writes: ComponentStateWrite[] = [];
        const instance = spawn(calf, 'test:calf', observing(writes));
        tick(instance, 1);
        writes.length = 0;

        expect(instance.interactWithItem('minecraft:golden_dandelion')).toBe(true);
        expect(writes).toEqual([
            {
                component: 'minecraft:ageable',
                before: { remaining: 399, paused: false },
                after: { remaining: 399, paused: true }
            }
        ]);
    });

    it('undoes its countdown exactly, including the grown-up tick that clears it', () => {
        const writes: ComponentStateWrite[] = [];
        const instance = spawn(calf, 'test:calf', observing(writes));
        tick(instance, 1);
        const run = tickThenUndo(instance, writes, 400);

        expect(run.ticked).toEqual({});
        expect(run.undone).toEqual(run.before);
    });
});

describe('minecraft:ambient_sound_interval state', () => {
    it('reports its countdown, redraws it after a sound, and undoes it exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const instance = spawn(chatty, 'test:chatty', observing(writes, { effects: { playSound: () => true } }));
        const run = tickThenUndo(instance, writes, 25);

        expect(run.writes).toContainEqual({
            component: 'minecraft:ambient_sound_interval',
            before: { remaining: 1 },
            after: { remaining: 20 }
        });
        expect(run.ticked).toEqual({ 'minecraft:ambient_sound_interval': { remaining: 15 } });
        expect(run.undone).toEqual(run.before);
    });
});

describe('minecraft:transformation state', () => {
    it('transforms once its delay runs out, and undoes its countdown exactly', () => {
        const writes: ComponentStateWrite[] = [];
        const requests: TransformRequest[] = [];
        const instance = spawn(
            husk,
            'test:husk',
            observing(writes, { transform: (_entity, request) => requests.push(request) })
        );
        const run = tickThenUndo(instance, writes, 21);

        expect(requests.map((request) => request.identifier)).toEqual(['minecraft:zombie']);
        expect(run.writes.at(-1)).toEqual({
            component: 'minecraft:transformation',
            before: { remaining: 0 },
            after: null
        });
        expect(run.undone).toEqual(run.before);
    });
});
