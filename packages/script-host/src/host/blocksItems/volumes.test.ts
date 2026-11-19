import { describe, expect, it } from 'vitest';

import { partialSort } from './volumes';

describe('partialSort', () => {
    const byValue = (a: { value: number }, b: { value: number }) => a.value < b.value;

    it('returns the first items in order, as many as asked and no more than given', () => {
        const items = [5, 3, 9, 1, 7].map((value) => ({ value }));
        expect(partialSort(items, 3, byValue).map(({ value }) => value)).toEqual([1, 3, 5]);
        expect(partialSort(items, 10, byValue).map(({ value }) => value)).toEqual([1, 3, 5, 7, 9]);
        expect(partialSort(items, 0, byValue)).toEqual([]);
    });

    it('orders ties as a heap leaves them, which is the order BDS returns its closest blocks in', () => {
        // The distances of the twelve blocks of a 3 by 2 by 2 volume from (1, 0, 0), in the x,
        // then y, then z order BDS weighs them; the scenario recorded 4, 6, 5 and 0 as the closest.
        const distances = [1, 2, 2, 3, 0, 1, 1, 2, 1, 2, 2, 3];
        const items = distances.map((value, index) => ({ value, index }));
        expect(partialSort(items, 4, byValue).map(({ index }) => index)).toEqual([4, 6, 5, 0]);
    });
});
