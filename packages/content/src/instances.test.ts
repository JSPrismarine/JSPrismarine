import { beforeEach, describe, expect, it } from 'vitest';

import type { ComponentFactory } from './components';
import { anyValue, ComponentRegistry } from './components';
import type { Definition } from './definitions';
import { ContentError } from './errors';
import { Instance } from './instances';
import { Registry } from './registry';
import type { Type } from './types';
import { resolveTypes } from './types';

interface BlockHooks {
    onTick: (log: string[]) => void;
}

const ticking = (name: string, label: string): ComponentFactory<BlockHooks> => ({
    name,
    hooks: ['onTick'],
    schema: anyValue,
    create: () => ({ onTick: (log) => void log.push(label) })
});

const definition = (identifier: string, component: string): Definition => ({
    identifier,
    registry: 'blocks',
    pack: 'base',
    path: `blocks/${identifier.split(':')[1]}.json`,
    data: { component }
});

let registry: Registry<Type<BlockHooks>>;

const load = (...definitions: Definition[]): void => {
    const components = new ComponentRegistry<BlockHooks>();
    components.register(ticking('jsp:base', 'base'));
    components.register(ticking('jsp:overlay', 'overlay'));

    const { types } = resolveTypes(definitions, {
        components,
        read: (input) => {
            const data = input.data;
            if (typeof data !== 'object' || data === null || !('component' in data)) return [];
            return [{ name: String(data.component), value: {} }];
        }
    });
    registry.rebuild(types);
};

beforeEach(() => {
    registry = new Registry('blocks');
});

describe('Instance', () => {
    it('carries per-instance state beside a reference to its type', () => {
        load(definition('jsp:furnace', 'jsp:base'));
        const instance = new Instance(registry.holder('jsp:furnace'), { burnTicks: 40 });

        expect(instance.state.burnTicks).toBe(40);
        expect(instance.type.identifier).toBe('jsp:furnace');

        instance.state = { burnTicks: 0 };

        expect(instance.state.burnTicks).toBe(0);
    });

    it('dispatches through the hook table its type built at load', () => {
        load(definition('jsp:furnace', 'jsp:base'));
        const instance = new Instance(registry.holder('jsp:furnace'), undefined);
        const log: string[] = [];

        instance.dispatch('onTick', log);

        expect(log).toEqual(['base']);
    });

    it('sees the new type after content reloads', () => {
        load(definition('jsp:furnace', 'jsp:base'));
        const instance = new Instance(registry.holder('jsp:furnace'), undefined);

        load(definition('jsp:furnace', 'jsp:overlay'));
        const log: string[] = [];
        instance.dispatch('onTick', log);

        expect(log).toEqual(['overlay']);
    });

    it('reports an unbound type instead of ticking a stale one', () => {
        load(definition('jsp:furnace', 'jsp:base'));
        const instance = new Instance(registry.holder('jsp:furnace'), undefined);

        load(definition('jsp:anvil', 'jsp:base'));

        expect(instance.holder.bound).toBe(false);
        expect(() => instance.type).toThrow(ContentError);
        expect(() => instance.dispatch('onTick', [])).toThrow(/jsp:furnace/);
    });
});
