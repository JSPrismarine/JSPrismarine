import type { ComponentFactory } from '@jsprismarine/content';
import { accepted } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import type { ComponentStateWrite } from './componentState';
import { defineComponentState, isComponentStateRecord, stateField } from './componentState';
import { observing, tickThenUndo } from './componentState.test.helper';
import { createEntityComponentRegistry } from './components';
import type { EntityInstance } from './entityInstance';
import { EntityTypes } from './entityTypes';
import type { EntityHooks } from './hooks';

const COUNTER = defineComponentState('test:counter', {
    count: stateField.number,
    seen: stateField.list(stateField.id),
    last: stateField.nullable(stateField.boolean)
});

/** A component that counts its ticks through the slot. */
const counter: ComponentFactory<EntityHooks, undefined> = {
    name: 'test:counter',
    hooks: ['onInitialize', 'onTick'],
    schema: () => accepted(undefined),
    create: () => ({
        onInitialize: (entity) => entity.componentState.set(COUNTER, { count: 0, seen: [], last: null }),
        onTick: (entity) => {
            const state = entity.componentState.get(COUNTER);
            if (state === undefined) return;
            entity.componentState.set(COUNTER, { ...state, count: state.count + 1, last: state.count % 2 === 0 });
        }
    })
};

const definition = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:counted' },
        components: { 'minecraft:physics': {} },
        component_groups: { 'test:counting': { 'test:counter': {} } },
        events: {
            'test:start': { add: { component_groups: ['test:counting'] } },
            'test:stop': { remove: { component_groups: ['test:counting'] } }
        }
    }
};

const spawn = (writes: ComponentStateWrite[] = []): EntityInstance => {
    const components = createEntityComponentRegistry();
    components.register(counter);
    const types = new EntityTypes({ components });
    types.load([{ data: definition, pack: 'test', path: 'entities/counted.json' }]);
    return types.spawn('test:counted', { environment: observing(writes) });
};

const start = (entity: EntityInstance): void => {
    entity.fire('test:start');
    entity.tick();
};

describe('ComponentStates', () => {
    it('reads back what a component wrote, through its declared key', () => {
        const entity = spawn();
        start(entity);
        entity.tick();
        entity.tick();

        expect(entity.componentState.get(COUNTER)).toEqual({ count: 3, seen: [], last: true });
    });

    it('reports every write with its before and after values', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(writes);
        start(entity);

        expect(writes).toEqual([
            { component: 'test:counter', before: null, after: { count: 0, seen: [], last: null } },
            {
                component: 'test:counter',
                before: { count: 0, seen: [], last: null },
                after: { count: 1, seen: [], last: true }
            }
        ]);
    });

    it('reports nothing for a write that leaves the state as it was', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(writes);
        start(entity);
        writes.length = 0;
        const state = entity.componentState.get(COUNTER);
        if (state !== undefined) entity.componentState.set(COUNTER, { ...state, seen: [...state.seen] });
        entity.componentState.write('minecraft:physics', null);

        expect(writes).toEqual([]);
        expect(entity.componentState.get(COUNTER)).toBe(state);
    });

    it('freezes written values, so a reported before-value cannot change afterwards', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(writes);
        start(entity);

        expect(Object.isFrozen(writes[0]?.after)).toBe(true);
        expect(Object.isFrozen(entity.componentState.get(COUNTER)?.seen)).toBe(true);
    });

    it('returns to the exact earlier slot when the writes are undone in reverse', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(writes);
        start(entity);
        const run = tickThenUndo(entity, writes, 5);

        expect(run.writes).toHaveLength(5);
        expect(run.ticked).not.toEqual(run.before);
        expect(run.undone).toEqual(run.before);
    });

    it('clears the state of a component that leaves the active set, and reports it', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(writes);
        start(entity);
        writes.length = 0;
        entity.fire('test:stop');
        entity.tick();

        expect([...entity.componentState.entries()]).toEqual([]);
        expect(writes).toEqual([
            { component: 'test:counter', before: { count: 1, seen: [], last: true }, after: null }
        ]);
    });

    it('refuses a host write that does not match the declared shape', () => {
        const writes: ComponentStateWrite[] = [];
        const entity = spawn(writes);
        start(entity);
        writes.length = 0;

        expect(entity.componentState.write('test:counter', { count: 'three' })).toBe(false);
        expect(entity.componentState.get(COUNTER)?.count).toBe(1);
        expect(writes).toEqual([]);
    });

    it('saves active declared components, with null for one that holds no state', () => {
        const entity = spawn();
        start(entity);

        expect(entity.componentState.snapshot()).toEqual({ 'test:counter': { count: 1, seen: [], last: true } });

        entity.componentState.clear(COUNTER);

        expect(entity.componentState.snapshot()).toEqual({ 'test:counter': null });
    });

    it('restores a saved form over the initialized state, skipping inactive or malformed entries', () => {
        const saved = spawn();
        start(saved);
        for (let tick = 0; tick < 4; tick += 1) saved.tick();
        const form = JSON.parse(JSON.stringify(saved.componentState.snapshot()));

        const restored = spawn();
        expect(restored.componentState.restore(form)).toEqual([]);
        expect([...restored.componentState.entries()]).toEqual([]);

        start(restored);
        const skipped = restored.componentState.restore({
            ...form,
            'test:counter': { count: 'five' },
            'minecraft:physics': { anything: 1 }
        });
        expect(skipped).toEqual(['test:counter']);
        expect(restored.componentState.get(COUNTER)?.count).toBe(1);

        restored.componentState.restore(form);
        expect(restored.componentState.get(COUNTER)).toEqual(saved.componentState.get(COUNTER));
    });

    it('rejects two declarations for one component name', () => {
        const entity = spawn();
        const other = defineComponentState('test:counter', { count: stateField.number });

        entity.componentState.get(COUNTER);

        expect(() => entity.componentState.get(other)).toThrow('declares its component state twice');
    });
});

describe('isComponentStateRecord', () => {
    it('accepts plain data and refuses class instances and functions', () => {
        expect(isComponentStateRecord({ a: 1, b: [true, null, 'x'], c: { d: 2 } })).toBe(true);
        expect(isComponentStateRecord({ a: new Set() })).toBe(false);
        expect(isComponentStateRecord({ a: () => 1 })).toBe(false);
        expect(isComponentStateRecord({ a: undefined })).toBe(false);
        expect(isComponentStateRecord(null)).toBe(false);
        expect(isComponentStateRecord([1])).toBe(false);
    });
});
