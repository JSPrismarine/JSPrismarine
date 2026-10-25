import { beforeEach, describe, expect, it } from 'vitest';

import { BehaviorRegistry } from './behaviors';
import type { ComponentFactory } from './components';
import { accepted, anyValue, ComponentRegistry, rejected } from './components';
import type { Definition } from './definitions';
import type { ComponentEntry, ComponentReader } from './types';
import { ContentLoadError, resolveTypes } from './types';

interface BlockHooks {
    onPlace: (log: string[]) => void;
    onTick: (log: string[]) => void;
}

const definition = (identifier: string, pack: string, components: Record<string, unknown>): Definition => ({
    identifier,
    registry: 'blocks',
    pack,
    path: `blocks/${identifier.split(':')[1]}.json`,
    data: { components }
});

/** A domain reader: this one knows the test's definitions keep components under `data.components`. */
const read: ComponentReader = (input) => {
    const data = input.data;
    if (typeof data !== 'object' || data === null || !('components' in data)) return [];
    const components = data.components;
    if (typeof components !== 'object' || components === null) return [];
    return Object.entries(components).map(([name, value]): ComponentEntry => ({ name, value }));
};

const logging = (name: string, hook: 'onPlace' | 'onTick'): ComponentFactory<BlockHooks> => ({
    name,
    hooks: [hook],
    schema: anyValue,
    create: () =>
        hook === 'onPlace' ? { onPlace: (log) => void log.push(name) } : { onTick: (log) => void log.push(name) }
});

const friction: ComponentFactory<BlockHooks, number> = {
    name: 'jsp:friction',
    hooks: [],
    schema: (value) => (typeof value === 'number' ? accepted(value) : rejected('expected a number')),
    create: () => ({})
};

let components: ComponentRegistry<BlockHooks>;

beforeEach(() => {
    components = new ComponentRegistry<BlockHooks>();
    components.register(logging('jsp:first', 'onPlace'));
    components.register(logging('jsp:second', 'onPlace'));
    components.register(friction);
});

describe('resolveTypes', () => {
    it('binds a definition into a type whose hooks dispatch in declaration order', () => {
        const { types, diagnostics } = resolveTypes(
            [definition('jsp:marble', 'base', { 'jsp:first': {}, 'jsp:second': {} })],
            { components, read }
        );

        const log: string[] = [];
        const marble = types.get('jsp:marble')!;
        marble.hooks.dispatch('onPlace', log);

        expect(log).toEqual(['jsp:first', 'jsp:second']);
        expect(marble.components.map((component) => component.name)).toEqual(['jsp:first', 'jsp:second']);
        expect(marble.definition.pack).toBe('base');
        expect(diagnostics).toEqual([]);
    });

    it('narrows a component parameter back to the factory that parsed it', () => {
        const { types } = resolveTypes([definition('jsp:ice', 'base', { 'jsp:friction': 0.989 })], {
            components,
            read
        });

        const value: number | undefined = types.get('jsp:ice')!.params(friction);

        expect(value).toBe(0.989);
        expect(types.get('jsp:ice')!.hasComponent('jsp:friction')).toBe(true);
    });

    it('loads a type with an unknown component and reports it once per pack', () => {
        const { types, diagnostics } = resolveTypes(
            [
                definition('jsp:a', 'base', { 'jsp:mystery': {}, 'jsp:first': {} }),
                definition('jsp:b', 'base', { 'jsp:mystery': {} }),
                definition('jsp:c', 'overlay', { 'jsp:mystery': {} })
            ],
            { components, read }
        );

        expect(types.size).toBe(3);
        expect(types.get('jsp:a')!.components.map((component) => component.name)).toEqual(['jsp:first']);
        expect(diagnostics).toHaveLength(2);
        expect(diagnostics.map((diagnostic) => diagnostic.pack)).toEqual(['base', 'overlay']);
        // The path is the first file the pack declared it in, so the one
        // line the report carries still leads somewhere.
        expect(diagnostics[0]).toMatchObject({
            code: 'component.unknown',
            severity: 'warning',
            path: 'blocks/a.json'
        });
        expect(diagnostics[1]?.path).toBe('blocks/c.json');
        expect(diagnostics[0]?.message).toContain('jsp:mystery');
    });

    it('fails the load in strict mode and carries the report on the error', () => {
        let thrown: unknown;
        try {
            resolveTypes([definition('jsp:a', 'base', { 'jsp:mystery': {} })], { components, read, strict: true });
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(ContentLoadError);
        expect(thrown instanceof ContentLoadError && thrown.diagnostics).toHaveLength(1);
    });

    it('drops a component whose value the schema rejects and reports it', () => {
        const { types, diagnostics } = resolveTypes(
            [definition('jsp:ice', 'base', { 'jsp:friction': 'slippery', 'jsp:first': {} })],
            { components, read }
        );

        expect(types.get('jsp:ice')!.components.map((component) => component.name)).toEqual(['jsp:first']);
        expect(diagnostics[0]).toMatchObject({ code: 'component.invalid', severity: 'error', path: 'blocks/ice.json' });
        expect(diagnostics[0]?.message).toContain('expected a number');
    });

    it('runs attached behaviors after the definition components', () => {
        const behaviors = new BehaviorRegistry<BlockHooks>();
        behaviors.register({
            name: 'jsp:stone_family',
            hooks: ['onPlace'],
            create: () => ({ onPlace: (log) => log.push('jsp:stone_family') })
        });
        behaviors.attach('jsp:stone_family', 'jsp:marble');

        const { types } = resolveTypes([definition('jsp:marble', 'base', { 'jsp:first': {} })], {
            components,
            behaviors,
            read
        });

        const log: string[] = [];
        types.get('jsp:marble')!.hooks.dispatch('onPlace', log);

        expect(log).toEqual(['jsp:first', 'jsp:stone_family']);
        expect(types.get('jsp:marble')!.behaviors.map((behavior) => behavior.name)).toEqual(['jsp:stone_family']);
    });

    it('lets a behavior override what the definition bound', () => {
        const behaviors = new BehaviorRegistry<BlockHooks>();
        behaviors.register({
            name: 'jsp:redstone',
            hooks: ['onPlace'],
            override: true,
            create: () => ({ onPlace: (log) => log.push('jsp:redstone') })
        });
        behaviors.attach('jsp:redstone', 'jsp:marble');

        const { types } = resolveTypes([definition('jsp:marble', 'base', { 'jsp:first': {} })], {
            components,
            behaviors,
            read
        });

        const log: string[] = [];
        types.get('jsp:marble')!.hooks.dispatch('onPlace', log);

        expect(log).toEqual(['jsp:redstone']);
        expect(types.get('jsp:marble')!.hooks.contributors('onPlace')).toEqual(['jsp:redstone']);
    });

    it('lets a reader mark a later component entry as an override', () => {
        const overriding: ComponentReader = (input) => [
            ...read(input),
            { name: 'jsp:second', value: {}, override: true }
        ];

        const { types } = resolveTypes([definition('jsp:marble', 'base', { 'jsp:first': {} })], {
            components,
            read: overriding
        });

        const log: string[] = [];
        types.get('jsp:marble')!.hooks.dispatch('onPlace', log);

        expect(log).toEqual(['jsp:second']);
    });

    it('computes the flags a domain declares once per type', () => {
        let calls = 0;
        const { types } = resolveTypes([definition('jsp:ice', 'base', { 'jsp:friction': 0.989 })], {
            components,
            read,
            flags: {
                slippery: (type) => {
                    calls += 1;
                    return (type.params(friction) ?? 0.6) > 0.8;
                }
            }
        });

        const ice = types.get('jsp:ice')!;

        expect(ice.flags.slippery).toBe(true);
        expect(ice.flags.slippery).toBe(true);
        expect(calls).toBe(1);
        // @ts-expect-error the spec declares `slippery` and nothing else
        void ice.flags.solid;
    });
});
