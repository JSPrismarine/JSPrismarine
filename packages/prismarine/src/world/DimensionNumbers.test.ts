import { describe, expect, it } from 'vitest';

import { DimensionNumbers } from './DimensionNumbers';
import { FIRST_CUSTOM_DIMENSION_ID } from './DimensionType';

const FIRST = FIRST_CUSTOM_DIMENSION_ID;

describe('DimensionNumbers', () => {
    it('numbers a save without a table in the order it is asked, as stem order did', () => {
        const numbers = new DimensionNumbers(undefined);

        expect(['test:a', 'test:b', 'test:a'].map((type) => numbers.numberOf(type))).toEqual([FIRST, FIRST + 1, FIRST]);
        expect(numbers.isChanged()).toBe(true);
    });

    it('answers the kept number whatever order the dimensions come in, and never gives one twice', () => {
        const first = new DimensionNumbers(undefined);
        for (const type of ['test:a', 'test:gone', 'test:b']) first.numberOf(type);
        const saved = first.saved();
        expect(first.isChanged()).toBe(false);

        const second = new DimensionNumbers(saved);
        expect(second.numberOf('test:b')).toBe(FIRST + 2);
        expect(second.numberOf('test:new')).toBe(FIRST + 3);
        expect(second.numberOf('test:a')).toBe(FIRST);
        expect(second.uuidOf('test:a')).toBe(first.uuidOf('test:a'));
    });
});
