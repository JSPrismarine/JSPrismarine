import { describe, expect, it } from 'vitest';

import { FilterBlockBuilder, FilterBlockReader } from './FilterBlock';

const key = (index: number): Buffer => Buffer.from(`chunk:${String(index).padStart(8, '0')}`);

describe('LevelDB filter blocks', () => {
    it('maps data-block offsets to BuiltinBloomFilter2 segments', () => {
        const builder = new FilterBlockBuilder();
        const firstKeys = Array.from({ length: 100 }, (_unused, index) => key(index));
        builder.startBlock(0);
        for (const entry of firstKeys) builder.addKey(entry);
        builder.startBlock(2 * 2048);
        const laterKey = key(200);
        builder.addKey(laterKey);
        const reader = new FilterBlockReader(builder.finish());

        for (const entry of firstKeys) expect(reader.keyMayMatch(0, entry)).toBe(true);
        expect(reader.keyMayMatch(2048, key(999))).toBe(false);
        expect(reader.keyMayMatch(4096, laterKey)).toBe(true);

        const definiteMiss = Array.from({ length: 1000 }, (_unused, index) => key(index + 1000)).find(
            (entry) => !reader.keyMayMatch(0, entry)
        );
        expect(definiteMiss).toBeDefined();
    });

    it('keeps malformed filter blocks from rejecting point lookups', () => {
        expect(new FilterBlockReader(Buffer.alloc(4)).keyMayMatch(0, key(0))).toBe(true);
        expect(new FilterBlockReader(Buffer.from([0, 0, 0, 0, 0, 255])).keyMayMatch(0, key(0))).toBe(true);
    });
});
