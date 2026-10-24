import { describe, expect, it } from 'vitest';

import type { Behavior } from './behaviors';
import { BehaviorRegistry } from './behaviors';
import type { BindContext } from './components';
import type { Definition } from './definitions';
import { ContentError } from './errors';

interface BlockHooks {
    onPlace: (position: number) => void;
    onTick: (position: number) => void;
}

const contextFor = (identifier: string): BindContext => {
    const definition: Definition = {
        identifier,
        registry: 'blocks',
        pack: 'base',
        path: `blocks/${identifier.split(':')[1]}.json`,
        data: {}
    };
    return { identifier, definition };
};

const behavior = (name: string, override?: boolean): Behavior<BlockHooks> => ({
    name,
    hooks: ['onPlace'],
    create: () => ({ onPlace: () => undefined }),
    ...(override === undefined ? {} : { override })
});

const registryWith = (...names: string[]): BehaviorRegistry<BlockHooks> => {
    const registry = new BehaviorRegistry<BlockHooks>();
    for (const name of names) registry.register(behavior(name));
    return registry;
};

describe('BehaviorRegistry', () => {
    it('attaches a behavior to one identifier', () => {
        const registry = registryWith('jsp:door');
        registry.attach('jsp:door', 'jsp:oak_door');

        expect(registry.bind(contextFor('jsp:oak_door')).map((bound) => bound.name)).toEqual(['jsp:door']);
        expect(registry.bind(contextFor('jsp:stone'))).toEqual([]);
    });

    it('attaches a behavior to a list of identifiers', () => {
        const registry = registryWith('jsp:door');
        registry.attach('jsp:door', ['jsp:oak_door', 'jsp:birch_door']);

        expect(registry.bind(contextFor('jsp:birch_door')).map((bound) => bound.name)).toEqual(['jsp:door']);
    });

    it('attaches a behavior through a predicate, which is how a tag binds', () => {
        const logs = new Set(['jsp:oak_log', 'jsp:birch_log']);
        const registry = registryWith('jsp:log');
        registry.attach('jsp:log', (identifier) => logs.has(identifier));

        expect(registry.bind(contextFor('jsp:oak_log')).map((bound) => bound.name)).toEqual(['jsp:log']);
        expect(registry.bind(contextFor('jsp:stone'))).toEqual([]);
    });

    it('keeps behaviors in attachment order', () => {
        const registry = registryWith('jsp:first', 'jsp:second', 'jsp:third');
        registry.attach('jsp:third', 'jsp:stone');
        registry.attach('jsp:first', 'jsp:stone');
        registry.attach('jsp:second', 'jsp:stone');

        expect(registry.bind(contextFor('jsp:stone')).map((bound) => bound.name)).toEqual([
            'jsp:third',
            'jsp:first',
            'jsp:second'
        ]);
    });

    it('binds a behavior attached twice to one identifier only once', () => {
        const registry = registryWith('jsp:door', 'jsp:other');
        registry.attach('jsp:door', 'jsp:oak_door');
        registry.attach('jsp:other', 'jsp:oak_door');
        registry.attach('jsp:door', ['jsp:oak_door']);

        expect(registry.bind(contextFor('jsp:oak_door')).map((bound) => bound.name)).toEqual(['jsp:door', 'jsp:other']);
    });

    it('carries the override flag through to the dispatch table', () => {
        const registry = new BehaviorRegistry<BlockHooks>();
        registry.register(behavior('jsp:base'));
        registry.register(behavior('jsp:overlay', true));
        registry.attach('jsp:base', 'jsp:stone');
        registry.attach('jsp:overlay', 'jsp:stone');

        expect(registry.bind(contextFor('jsp:stone')).map((bound) => bound.override)).toEqual([false, true]);
    });

    it('tells the behavior which type it is binding to', () => {
        const seen: string[] = [];
        const registry = new BehaviorRegistry<BlockHooks>();
        registry.register({
            name: 'jsp:door',
            hooks: [],
            create: (context) => {
                seen.push(context.identifier);
                return {};
            }
        });
        registry.attach('jsp:door', ['jsp:oak_door', 'jsp:birch_door']);

        registry.bind(contextFor('jsp:oak_door'));
        registry.bind(contextFor('jsp:birch_door'));

        expect(seen).toEqual(['jsp:oak_door', 'jsp:birch_door']);
    });

    it('rejects a second behavior under one name', () => {
        const registry = registryWith('jsp:door');

        expect(() => registry.register(behavior('jsp:door'))).toThrow(ContentError);
    });

    it('rejects attaching a name nothing registered', () => {
        const registry = new BehaviorRegistry<BlockHooks>();

        expect(() => registry.attach('jsp:door', 'jsp:oak_door')).toThrow(/jsp:door/);
    });

    it('rejects a behavior that returns a hook it never declared', () => {
        const registry = new BehaviorRegistry<BlockHooks>();
        registry.register({ name: 'jsp:sneaky', hooks: ['onTick'], create: () => ({ onPlace: () => undefined }) });
        registry.attach('jsp:sneaky', 'jsp:stone');

        expect(() => registry.bind(contextFor('jsp:stone'))).toThrow(/onPlace/);
    });
});
