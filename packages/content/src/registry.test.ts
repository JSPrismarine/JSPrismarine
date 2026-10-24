import { describe, expect, it } from 'vitest';

import { ContentError } from './errors';
import { Registry } from './registry';

interface Thing {
    hardness: number;
}

const build = (...keys: string[]): Registry<Thing> => {
    const registry = new Registry<Thing>('things');
    registry.rebuild(keys.map((key, index) => [key, { hardness: index }] as const));
    return registry;
};

describe('Registry', () => {
    it('numbers entries from zero in insertion order', () => {
        const registry = build('jsp:stone', 'jsp:dirt', 'jsp:sand');

        expect(registry.idOf('jsp:stone')).toBe(0);
        expect(registry.idOf('jsp:dirt')).toBe(1);
        expect(registry.idOf('jsp:sand')).toBe(2);
        expect(registry.keyOf(2)).toBe('jsp:sand');
        expect(registry.at(1)).toEqual({ hardness: 1 });
        expect(registry.get('jsp:dirt')).toEqual({ hardness: 1 });
        expect(registry.size).toBe(3);
    });

    it('iterates in id order', () => {
        const registry = build('jsp:sand', 'jsp:stone', 'jsp:dirt');

        expect(registry.keys()).toEqual(['jsp:sand', 'jsp:stone', 'jsp:dirt']);
        expect([...registry].map(([key]) => key)).toEqual(['jsp:sand', 'jsp:stone', 'jsp:dirt']);
    });

    it('gives the same ids to the same insertion order on a rebuild', () => {
        const registry = build('jsp:stone', 'jsp:dirt');
        const before = registry.keys().map((key) => registry.idOf(key));

        registry.rebuild([
            ['jsp:stone', { hardness: 7 }],
            ['jsp:dirt', { hardness: 8 }]
        ]);

        expect(registry.keys().map((key) => registry.idOf(key))).toEqual(before);
        expect(registry.get('jsp:stone')).toEqual({ hardness: 7 });
    });

    it('renumbers when the insertion order changes', () => {
        const registry = build('jsp:stone', 'jsp:dirt');

        registry.rebuild([
            ['jsp:dirt', { hardness: 0 }],
            ['jsp:stone', { hardness: 1 }]
        ]);

        expect(registry.idOf('jsp:dirt')).toBe(0);
        expect(registry.idOf('jsp:stone')).toBe(1);
    });

    it('counts a build in its generation', () => {
        const registry = build('jsp:stone');
        expect(registry.generation).toBe(1);

        registry.rebuild([['jsp:stone', { hardness: 1 }]]);
        expect(registry.generation).toBe(2);
    });

    it('rejects a key registered twice in one build', () => {
        const registry = new Registry<Thing>('things');

        expect(() =>
            registry.rebuild([
                ['jsp:stone', { hardness: 0 }],
                ['jsp:stone', { hardness: 1 }]
            ])
        ).toThrow(ContentError);
    });

    it('freezes the built key and value lists', () => {
        const registry = build('jsp:stone');

        expect(Object.isFrozen(registry.keys())).toBe(true);
        expect(Object.isFrozen(registry.values())).toBe(true);
    });
});

describe('Holder', () => {
    it('reads the value the current build holds', () => {
        const registry = build('jsp:stone');
        const holder = registry.holder('jsp:stone');

        expect(holder.registry).toBe('things');
        expect(holder.key).toBe('jsp:stone');
        expect(holder.bound).toBe(true);
        expect(holder.id).toBe(0);
        expect(holder.value()).toEqual({ hardness: 0 });
    });

    it('is the same object for the same key', () => {
        const registry = build('jsp:stone');

        expect(registry.holder('jsp:stone')).toBe(registry.holder('jsp:stone'));
    });

    it('follows its key across a rebuild that moves and changes the entry', () => {
        const registry = build('jsp:stone');
        const holder = registry.holder('jsp:stone');

        registry.rebuild([
            ['jsp:dirt', { hardness: 5 }],
            ['jsp:stone', { hardness: 9 }]
        ]);

        expect(registry.holder('jsp:stone')).toBe(holder);
        expect(holder.id).toBe(1);
        expect(holder.value()).toEqual({ hardness: 9 });
    });

    it('binds a key only a later build introduces', () => {
        const registry = build('jsp:stone');
        const holder = registry.holder('jsp:copper');

        expect(holder.bound).toBe(false);
        expect(holder.get()).toBeUndefined();
        expect(() => holder.value()).toThrow(ContentError);

        registry.rebuild([
            ['jsp:stone', { hardness: 0 }],
            ['jsp:copper', { hardness: 3 }]
        ]);

        expect(holder.bound).toBe(true);
        expect(holder.value()).toEqual({ hardness: 3 });
    });

    it('unbinds when a rebuild drops its key', () => {
        const registry = build('jsp:stone', 'jsp:dirt');
        const holder = registry.holder('jsp:dirt');

        registry.rebuild([['jsp:stone', { hardness: 0 }]]);

        expect(holder.bound).toBe(false);
        expect(holder.id).toBeUndefined();
        expect(() => holder.value()).toThrow(/jsp:dirt/);
    });
});
