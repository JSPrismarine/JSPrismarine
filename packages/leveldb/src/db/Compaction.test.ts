import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompressionType } from '../compression/Compression';
import { compactEntries } from './Compaction';
import {
    ValueType,
    compareInternalKeys,
    encodeInternalKey,
    extractUserKey,
    findShortInternalSuccessor,
    findShortestInternalSeparator
} from '../format/InternalKey';
import { TableBuilder } from '../format/TableBuilder';
import { TableReader, bufferSource } from '../format/TableReader';
import type { BlockEntry } from '../format/BlockReader';

const table = {
    compression: CompressionType.None,
    shortestSeparator: findShortestInternalSeparator,
    shortSuccessor: findShortInternalSuccessor,
    filterKey: extractUserKey
};

/** Values that do not compress, so each output fills close to the cap. */
const noise = (seed: number, length: number): Buffer => {
    const value = Buffer.allocUnsafe(length);
    let state = seed | 1;
    for (let i = 0; i < length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        value[i] = state >>> 24;
    }
    return value;
};

const entry = (name: string, sequence: number, type: ValueType = ValueType.Value, value = noise(sequence, 200)) => ({
    key: encodeInternalKey(Buffer.from(name), BigInt(sequence), type),
    value: type === ValueType.Deletion ? Buffer.alloc(0) : value
});

const sorted = (entries: BlockEntry[]): BlockEntry[] => entries.sort((a, b) => compareInternalKeys(a.key, b.key));

describe('leveldb', () => {
    describe('compaction', () => {
        afterEach(() => vi.restoreAllMocks());

        it('builds each output table once and keeps every one under the cap', () => {
            const finish = vi.spyOn(TableBuilder.prototype, 'finish');
            const maxFileSize = 16 * 1024;
            const input = sorted(
                Array.from({ length: 2000 }, (_, i) => entry(`key:${String(i).padStart(5, '0')}`, i + 1))
            );

            const outputs = [...compactEntries(input, { maxFileSize, table, hasOlderFile: () => false })];

            expect(outputs.length).toBeGreaterThan(1);
            expect(finish).toHaveBeenCalledTimes(outputs.length);
            for (const output of outputs) expect(output.bytes.byteLength).toBeLessThanOrEqual(maxFileSize);
        });

        it('fills each table to most of the cap', () => {
            const maxFileSize = 16 * 1024;
            const input = sorted(
                Array.from({ length: 2000 }, (_, i) => entry(`key:${String(i).padStart(5, '0')}`, i + 1))
            );

            const outputs = [...compactEntries(input, { maxFileSize, table, hasOlderFile: () => false })];

            // The bound is conservative by its index, filter and trailer allowances, not by blocks.
            for (const output of outputs.slice(0, -1)) {
                expect(output.bytes.byteLength).toBeGreaterThan(maxFileSize * 0.9);
            }
        });

        it('gives an entry bigger than the cap a table of its own', () => {
            const input = sorted([entry('a', 1), entry('b', 2, ValueType.Value, noise(2, 64 * 1024)), entry('c', 3)]);

            const outputs = [...compactEntries(input, { maxFileSize: 8 * 1024, table, hasOlderFile: () => false })];

            expect(outputs.map((output) => extractUserKey(output.smallest).toString())).toEqual(['a', 'b', 'c']);
        });

        it('keeps the newest version of a key and records each table bounds', () => {
            const input = sorted([entry('a', 5), entry('a', 9), entry('b', 3)]);

            const [output] = [...compactEntries(input, { maxFileSize: 1 << 20, table, hasOlderFile: () => false })];
            const reader = new TableReader(bufferSource(output!.bytes), compareInternalKeys);
            const keys = [...reader.entries()].map((e) => e.key);

            expect(keys).toEqual([input[0]!.key, input[2]!.key]);
            expect(output!.smallest).toEqual(input[0]!.key);
            expect(output!.largest).toEqual(input[2]!.key);
        });

        it('drops a deletion only once nothing deeper can hold the key', () => {
            const input = sorted([entry('a', 2, ValueType.Deletion), entry('a', 1), entry('b', 4, ValueType.Deletion)]);

            const [output] = [
                ...compactEntries(input, {
                    maxFileSize: 1 << 20,
                    table,
                    hasOlderFile: (userKey) => userKey.toString() === 'b'
                })
            ];
            const keys = [...new TableReader(bufferSource(output!.bytes), compareInternalKeys).entries()].map((e) =>
                extractUserKey(e.key).toString()
            );

            expect(keys).toEqual(['b']);
        });
    });
});
