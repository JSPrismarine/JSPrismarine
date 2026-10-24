import { describe, expect, it } from 'vitest';

import { HookTable } from './hooks';

/** A domain's hook map. The content runtime never names a hook itself. */
interface BlockHooks {
    onPlace: (position: number) => void;
    onInteract: (player: string) => string | undefined;
}

const calls: string[] = [];
const record =
    (source: string) =>
    (position: number): void => {
        calls.push(`${source}:${position}`);
    };

describe('HookTable', () => {
    it('reports which hooks anything implements', () => {
        const table = new HookTable<BlockHooks>([{ source: 'jsp:a', handlers: { onPlace: record('a') } }]);

        expect(table.has('onPlace')).toBe(true);
        expect(table.has('onInteract')).toBe(false);
        expect(table.handlers('onInteract')).toEqual([]);
    });

    it('runs handlers in contribution order', () => {
        calls.length = 0;
        const table = new HookTable<BlockHooks>([
            { source: 'jsp:a', handlers: { onPlace: record('a') } },
            { source: 'jsp:b', handlers: { onPlace: record('b') } },
            { source: 'jsp:c', handlers: { onPlace: record('c') } }
        ]);

        table.dispatch('onPlace', 7);

        expect(calls).toEqual(['a:7', 'b:7', 'c:7']);
        expect(table.contributors('onPlace')).toEqual(['jsp:a', 'jsp:b', 'jsp:c']);
    });

    it('lets an override replace every earlier handler for that hook alone', () => {
        calls.length = 0;
        const table = new HookTable<BlockHooks>([
            { source: 'jsp:base', handlers: { onPlace: record('base'), onInteract: () => 'base' } },
            { source: 'jsp:powered', handlers: { onPlace: record('powered') }, override: true }
        ]);

        table.dispatch('onPlace', 1);

        expect(calls).toEqual(['powered:1']);
        expect(table.contributors('onPlace')).toEqual(['jsp:powered']);
        expect(table.contributors('onInteract')).toEqual(['jsp:base']);
    });

    it('keeps a plain contribution that follows an override', () => {
        calls.length = 0;
        const table = new HookTable<BlockHooks>([
            { source: 'jsp:base', handlers: { onPlace: record('base') } },
            { source: 'jsp:powered', handlers: { onPlace: record('powered') }, override: true },
            { source: 'jsp:extra', handlers: { onPlace: record('extra') } }
        ]);

        table.dispatch('onPlace', 2);

        expect(calls).toEqual(['powered:2', 'extra:2']);
    });

    it('stops at the first handler that returns a value', () => {
        const table = new HookTable<BlockHooks>([
            { source: 'jsp:a', handlers: { onInteract: () => undefined } },
            { source: 'jsp:b', handlers: { onInteract: (player) => `b saw ${player}` } },
            {
                source: 'jsp:c',
                handlers: {
                    onInteract: () => {
                        throw new Error('jsp:c must not run');
                    }
                }
            }
        ]);

        expect(table.dispatchFirst('onInteract', 'steve')).toBe('b saw steve');
    });

    it('returns undefined when no handler produces a value', () => {
        const table = new HookTable<BlockHooks>([{ source: 'jsp:a', handlers: { onInteract: () => undefined } }]);

        expect(table.dispatchFirst('onInteract', 'steve')).toBeUndefined();
        expect(new HookTable<BlockHooks>([]).dispatchFirst('onInteract', 'steve')).toBeUndefined();
    });

    it('freezes the handler list so a caller cannot rewrite dispatch at run time', () => {
        const table = new HookTable<BlockHooks>([{ source: 'jsp:a', handlers: { onPlace: record('a') } }]);

        expect(Object.isFrozen(table.handlers('onPlace'))).toBe(true);
    });
});
