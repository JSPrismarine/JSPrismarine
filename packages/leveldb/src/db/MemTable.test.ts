import { describe, expect, it } from 'vitest';

import { MemTable } from './MemTable';
import { ValueType, extractUserKey, parseInternalKey } from '../format/InternalKey';

const key = (text: string) => Buffer.from(text);

describe('leveldb', () => {
    describe('MemTable', () => {
        it('reads back what was written', () => {
            const table = new MemTable();
            table.add(key('a'), 1n, ValueType.Value, key('one'));

            expect(table.get(key('a'))).toEqual({ found: true, value: key('one') });
        });

        it('reports a miss for a key it never saw', () => {
            expect(new MemTable().get(key('absent'))).toEqual({ found: false, value: null });
        });

        it('returns the newest version of a key', () => {
            const table = new MemTable();
            table.add(key('k'), 1n, ValueType.Value, key('old'));
            table.add(key('k'), 2n, ValueType.Value, key('new'));

            expect(table.get(key('k')).value).toEqual(key('new'));
        });

        it('returns the newest version even when it arrived first', () => {
            // Sequence order, not insertion order, decides which wins.
            const table = new MemTable();
            table.add(key('k'), 9n, ValueType.Value, key('new'));
            table.add(key('k'), 2n, ValueType.Value, key('old'));

            expect(table.get(key('k')).value).toEqual(key('new'));
        });

        it('distinguishes a tombstone from a miss', () => {
            // The distinction is load bearing: a tombstone has to stop the lookup before it
            // reaches an older table, while a miss has to let it through.
            const table = new MemTable();
            table.add(key('k'), 1n, ValueType.Value, key('v'));
            table.add(key('k'), 2n, ValueType.Deletion, null);

            expect(table.get(key('k'))).toEqual({ found: true, value: null });
            expect(table.get(key('other'))).toEqual({ found: false, value: null });
        });

        it('lets a later value resurrect a deleted key', () => {
            const table = new MemTable();
            table.add(key('k'), 1n, ValueType.Deletion, null);
            table.add(key('k'), 2n, ValueType.Value, key('back'));

            expect(table.get(key('k')).value).toEqual(key('back'));
        });

        it('iterates by user key ascending and version descending', () => {
            const table = new MemTable();
            table.add(key('b'), 1n, ValueType.Value, key('v'));
            table.add(key('a'), 1n, ValueType.Value, key('v'));
            table.add(key('a'), 3n, ValueType.Value, key('v'));

            const order = [...table.iterate()].map((entry) => {
                const parsed = parseInternalKey(entry.internalKey);
                return `${parsed.userKey.toString()}@${parsed.sequence}`;
            });

            expect(order).toEqual(['a@3', 'a@1', 'b@1']);
        });

        it('finds a key among many, whatever order they arrived in', () => {
            const table = new MemTable();
            const keys = Array.from({ length: 500 }, (_, i) => key(`key:${String((i * 37) % 500).padStart(4, '0')}`));
            keys.forEach((k, i) => table.add(k, BigInt(i + 1), ValueType.Value, Buffer.from(String(i))));

            for (const [i, k] of keys.entries()) {
                expect(table.get(k).value).toEqual(Buffer.from(String(i)));
            }

            expect(table.count).toBe(500);
        });

        it('reports its bounds as the smallest and largest internal keys', () => {
            const table = new MemTable();
            table.add(key('m'), 1n, ValueType.Value, key('v'));
            table.add(key('a'), 1n, ValueType.Value, key('v'));
            table.add(key('z'), 1n, ValueType.Value, key('v'));

            const bounds = table.bounds()!;
            expect(extractUserKey(bounds.smallest)).toEqual(key('a'));
            expect(extractUserKey(bounds.largest)).toEqual(key('z'));
        });

        it('has no bounds while empty', () => {
            expect(new MemTable().bounds()).toBeNull();
            expect(new MemTable().empty).toBe(true);
        });

        it('reports the highest sequence it holds, for restoring it after a replay', () => {
            const table = new MemTable();
            table.add(key('a'), 5n, ValueType.Value, key('v'));
            table.add(key('b'), 12n, ValueType.Value, key('v'));
            table.add(key('c'), 7n, ValueType.Value, key('v'));

            expect(table.maxSequence()).toBe(12n);
            expect(new MemTable().maxSequence()).toBe(0n);
        });

        it('grows its reported size as entries arrive', () => {
            const table = new MemTable();
            expect(table.size).toBe(0);

            table.add(key('k'), 1n, ValueType.Value, Buffer.alloc(1000));
            expect(table.size).toBeGreaterThan(1000);
        });
    });
});
