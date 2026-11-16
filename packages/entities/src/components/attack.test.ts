import { describe, expect, it } from 'vitest';

import { attack } from './vanilla';

describe('minecraft:attack schema', () => {
    it.each([
        ['a number', 4, { min: 4, max: 4 }],
        ['a [min, max] list, as the hoglin and zoglin adults write it', [3, 9], { min: 3, max: 9 }],
        ['a range object, as the iron golem writes it', { range_min: 7, range_max: 21 }, { min: 7, max: 21 }]
    ])('reads damage written as %s', (_form, damage, expected) => {
        const result = attack.schema({ damage });

        expect(result.ok && result.value.damage).toEqual(expected);
    });
});
