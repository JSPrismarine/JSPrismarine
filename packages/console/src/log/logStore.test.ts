import type { LogEntry } from '@jsprismarine/console-protocol';
import { describe, expect, it, vi } from 'vitest';
import { LogStore } from './logStore';

let seq = 0;
function entry(overrides: Partial<LogEntry> = {}): LogEntry {
    seq += 1;
    return {
        seq,
        level: 'info',
        namespace: 'Server',
        at: 1_700_000_000_000 + seq,
        message: `message ${seq}`,
        formatted: `[info] message ${seq}`,
        ...overrides
    };
}

const messages = (store: LogStore) => store.visible().map((record) => record.message);

describe('LogStore', () => {
    it('appends records in order and tags them with the current generation', () => {
        const store = new LogStore();
        store.append(entry({ message: 'first' }));
        store.append(entry({ message: 'second' }));

        expect(messages(store)).toEqual(['first', 'second']);
        expect(store.visible().every((record) => record.kind === 'log' && record.generation === 1)).toBe(true);
        expect(store.size).toBe(2);
    });

    it('keeps the newest records when the ring buffer wraps', () => {
        const store = new LogStore({ capacity: 3 });
        for (const message of ['a', 'b', 'c', 'd', 'e']) store.append(entry({ message }));

        expect(messages(store)).toEqual(['c', 'd', 'e']);
        expect(store.size).toBe(3);
        expect(store.evicted).toBe(2);
    });

    it('hides records below the level filter and counts them', () => {
        const store = new LogStore();
        store.append(entry({ level: 'error', message: 'boom' }));
        store.append(entry({ level: 'debug', message: 'noise' }));
        store.append(entry({ level: 'info', message: 'ok' }));

        store.setLevelFilter('info');
        expect(messages(store)).toEqual(['boom', 'ok']);
        expect(store.hiddenCount).toBe(1);

        store.setLevelFilter('silly');
        expect(messages(store)).toEqual(['boom', 'noise', 'ok']);
        expect(store.hiddenCount).toBe(0);
    });

    it('applies the level filter to records appended afterwards', () => {
        const store = new LogStore();
        store.setLevelFilter('warn');
        store.append(entry({ level: 'info', message: 'hidden' }));
        store.append(entry({ level: 'warn', message: 'shown' }));

        expect(messages(store)).toEqual(['shown']);
        expect(store.hiddenCount).toBe(1);
    });

    it('filters by namespace, case-insensitively, and inverts with a leading bang', () => {
        const store = new LogStore();
        store.append(entry({ namespace: 'Network', message: 'net' }));
        store.append(entry({ namespace: 'ChunkLoader', message: 'chunk' }));

        store.setNamespaceFilter('network');
        expect(messages(store)).toEqual(['net']);

        store.setNamespaceFilter('!chunk');
        expect(messages(store)).toEqual(['net']);

        store.setNamespaceFilter(undefined);
        expect(messages(store)).toEqual(['net', 'chunk']);
    });

    it('never hides separators, raw lines, or dropped notices', () => {
        const store = new LogStore();
        store.setLevelFilter('error');
        store.setNamespaceFilter('Nope');
        store.startGeneration('server restarted', 1_700_000_000_000);
        store.appendRaw('stderr', 'warning from node', 2);
        store.appendDropped(5);

        expect(store.visible().map((record) => record.kind)).toEqual(['separator', 'raw', 'dropped']);
        expect(store.hiddenCount).toBe(0);
    });

    it('bumps the generation with a separator that carries the reason', () => {
        const store = new LogStore();
        store.append(entry({ message: 'before' }));
        store.startGeneration('server restarted', 1_700_000_005_000);
        store.append(entry({ message: 'after' }));

        const [before, separator, after] = store.visible();
        expect(before).toMatchObject({ kind: 'log', generation: 1 });
        expect(separator).toMatchObject({
            kind: 'separator',
            generation: 2,
            message: 'server restarted',
            at: 1_700_000_005_000
        });
        expect(after).toMatchObject({ kind: 'log', generation: 2 });
        expect(store.generation).toBe(2);
    });

    it('stores raw child output with its stream and dropped counts', () => {
        const store = new LogStore();
        store.appendRaw('stdout', 'plain line', 3);
        store.appendDropped(12);

        expect(store.visible()[0]).toMatchObject({
            kind: 'raw',
            stream: 'stdout',
            message: 'plain line',
            generation: 3
        });
        expect(store.visible()[1]).toMatchObject({ kind: 'dropped', count: 12 });
    });

    it('reports search matches as indices into the visible list and steps through them', () => {
        const store = new LogStore();
        store.append(entry({ message: 'player joined' }));
        store.append(entry({ message: 'tick' }));
        store.append(entry({ message: 'Player left' }));
        store.append(entry({ message: 'tick' }));

        store.setSearch('player');
        expect(store.matches).toEqual([0, 2]);
        expect(store.nextMatch(0, 1)).toBe(2);
        expect(store.nextMatch(2, 1)).toBe(0);
        expect(store.nextMatch(0, -1)).toBe(2);
        expect(store.nextMatch(1, -1)).toBe(0);

        store.setSearch(undefined);
        expect(store.matches).toEqual([]);
        expect(store.nextMatch(0, 1)).toBeUndefined();
    });

    it('keeps search matches in sync with filters and later appends', () => {
        const store = new LogStore();
        store.setSearch('tick');
        store.append(entry({ level: 'debug', message: 'tick 1' }));
        store.append(entry({ level: 'info', message: 'tick 2' }));
        store.setLevelFilter('info');

        expect(store.matches).toEqual([0]);
        store.append(entry({ level: 'info', message: 'tick 3' }));
        expect(store.matches).toEqual([0, 1]);
    });

    it('jumps to the next visible record of a level in either direction', () => {
        const store = new LogStore();
        store.append(entry({ level: 'info' }));
        store.append(entry({ level: 'error' }));
        store.append(entry({ level: 'warn' }));
        store.append(entry({ level: 'error' }));

        expect(store.nextOfLevel(0, 'error', 1)).toBe(1);
        expect(store.nextOfLevel(1, 'error', 1)).toBe(3);
        expect(store.nextOfLevel(3, 'error', 1)).toBeUndefined();
        expect(store.nextOfLevel(3, 'error', -1)).toBe(1);
        expect(store.nextOfLevel(0, 'warn', -1)).toBeUndefined();
    });

    it('notifies listeners with the number of visible records appended', () => {
        const store = new LogStore();
        store.setLevelFilter('info');
        const listener = vi.fn();
        const unsubscribe = store.onChange(listener);

        store.append(entry({ level: 'debug' }));
        store.append(entry({ level: 'info' }));
        expect(listener).toHaveBeenLastCalledWith({ type: 'append', count: 1, evicted: 0 });

        store.setLevelFilter('warn');
        expect(listener).toHaveBeenLastCalledWith({ type: 'reset' });

        unsubscribe();
        store.append(entry({ level: 'error' }));
        expect(listener).toHaveBeenCalledTimes(3);
    });

    it('reports a visible record evicted by the ring buffer', () => {
        const store = new LogStore({ capacity: 2 });
        store.setLevelFilter('info');
        store.append(entry({ level: 'debug' }));
        store.append(entry());
        const listener = vi.fn();
        store.onChange(listener);

        store.append(entry());
        expect(listener).toHaveBeenLastCalledWith({ type: 'append', count: 1, evicted: 0 });
        store.append(entry());
        expect(listener).toHaveBeenLastCalledWith({ type: 'append', count: 1, evicted: 1 });
    });

    it('returns the same visible array until something changes', () => {
        const store = new LogStore();
        store.append(entry());
        const first = store.visible();
        expect(store.visible()).toBe(first);
        store.append(entry());
        expect(store.visible()).not.toBe(first);
    });

    it('drops evicted records from the visible list and the search matches', () => {
        const store = new LogStore({ capacity: 2 });
        store.setSearch('keep');
        store.append(entry({ message: 'keep 1' }));
        store.append(entry({ message: 'other' }));
        store.append(entry({ message: 'keep 2' }));

        expect(messages(store)).toEqual(['other', 'keep 2']);
        expect(store.matches).toEqual([1]);
    });
});
