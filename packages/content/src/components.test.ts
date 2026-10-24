import { describe, expect, it } from 'vitest';

import type { ComponentContext, ComponentFactory } from './components';
import { accepted, anyValue, ComponentRegistry, rejected } from './components';
import type { Definition } from './definitions';
import { ContentError } from './errors';

interface BlockHooks {
    onPlace: (position: number) => void;
    onTick: (position: number) => void;
}

const definition: Definition = {
    identifier: 'jsp:marble',
    registry: 'blocks',
    pack: 'base',
    path: 'blocks/marble.json',
    data: {}
};
const context: ComponentContext = { identifier: 'jsp:marble', definition };

/** `minecraft:friction`-shaped: one number, used to answer a question later. */
const friction: ComponentFactory<BlockHooks, number> = {
    name: 'jsp:friction',
    hooks: [],
    schema: (value) =>
        typeof value === 'number' ? accepted(value) : rejected(`expected a number, got ${typeof value}`),
    create: () => ({})
};

/** A component whose parameters decide whether it implements its declared hook. */
const ticking: ComponentFactory<BlockHooks, { looping: boolean }> = {
    name: 'jsp:ticking',
    hooks: ['onTick'],
    schema: (value) => accepted({ looping: value === true }),
    create: (params) => (params.looping ? { onTick: () => undefined } : {})
};

describe('ComponentRegistry', () => {
    it('finds a registered factory by name and lists what it knows', () => {
        const registry = new ComponentRegistry<BlockHooks>();
        registry.register(friction);

        expect(registry.has('jsp:friction')).toBe(true);
        expect(registry.has('jsp:unknown')).toBe(false);
        expect(registry.names()).toEqual(['jsp:friction']);
    });

    it('rejects a second factory under one name', () => {
        const registry = new ComponentRegistry<BlockHooks>();
        registry.register(friction);

        expect(() => registry.register(friction)).toThrow(ContentError);
    });

    it('parses the value once and hands the parsed parameters to the factory', () => {
        const seen: unknown[] = [];
        const registry = new ComponentRegistry<BlockHooks>();
        registry.register({
            name: 'jsp:friction',
            hooks: [],
            schema: friction.schema,
            create: (params) => {
                seen.push(params);
                return {};
            }
        });

        const result = registry.bind('jsp:friction', 0.989, context);

        expect(result.ok).toBe(true);
        expect(result.ok && result.value.params).toBe(0.989);
        expect(result.ok && result.value.name).toBe('jsp:friction');
        expect(seen).toEqual([0.989]);
    });

    it('reports the schema message when the value does not parse', () => {
        const registry = new ComponentRegistry<BlockHooks>();
        registry.register(friction);

        const result = registry.bind('jsp:friction', 'slippery', context);

        expect(result).toEqual({ ok: false, message: 'expected a number, got string' });
    });

    it('reports a name no factory claims', () => {
        const result = new ComponentRegistry<BlockHooks>().bind('jsp:nothing', {}, context);

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.message).toContain('jsp:nothing');
    });

    it('lets the parameters turn a declared hook off', () => {
        const registry = new ComponentRegistry<BlockHooks>();
        registry.register(ticking);

        const off = registry.bind('jsp:ticking', false, context);
        const on = registry.bind('jsp:ticking', true, context);

        expect(off.ok && Object.keys(off.value.handlers)).toEqual([]);
        expect(on.ok && Object.keys(on.value.handlers)).toEqual(['onTick']);
    });

    it('rejects a factory that returns a hook it never declared', () => {
        const registry = new ComponentRegistry<BlockHooks>();
        registry.register({
            name: 'jsp:sneaky',
            hooks: ['onTick'],
            schema: anyValue,
            create: () => ({ onPlace: () => undefined })
        });

        expect(() => registry.bind('jsp:sneaky', {}, context)).toThrow(/onPlace/);
    });
});
