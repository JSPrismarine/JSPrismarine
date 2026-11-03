import { describe, expect, it } from 'vitest';

import { bloomFilter2MayContain, createBloomFilter2 } from './BloomFilter';

const key = (index: number): Buffer => Buffer.from(`key:${String(index).padStart(8, '0')}`);

describe('BuiltinBloomFilter2', () => {
    it('never rejects a key used to build the filter', () => {
        const keys = Array.from({ length: 1000 }, (_unused, index) => key(index));
        const filter = createBloomFilter2(keys);

        for (const entry of keys) expect(bloomFilter2MayContain(entry, filter)).toBe(true);
    });

    it('can reject a definite miss and can admit a false positive', () => {
        const filter = createBloomFilter2([key(0)]);
        const definiteMiss = Array.from({ length: 1000 }, (_unused, index) => key(index + 1)).find(
            (entry) => !bloomFilter2MayContain(entry, filter)
        );

        expect(definiteMiss).toBeDefined();
        expect(
            bloomFilter2MayContain(Buffer.from('absent'), Buffer.concat([Buffer.alloc(8, 0xff), Buffer.from([6])]))
        ).toBe(true);
    });
});
