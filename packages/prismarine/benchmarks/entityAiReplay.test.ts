import { describe, expect, it } from 'vitest';

import { firstDivergentTick } from './entityAiReplay';

describe('firstDivergentTick', () => {
    it('returns no tick when both traces match', () => {
        expect(firstDivergentTick(['a', 'b'], ['a', 'b'])).toBeUndefined();
    });

    it('returns the first tick whose digest changed', () => {
        expect(firstDivergentTick(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    });

    it('reports the first missing tick when one trace ends early', () => {
        expect(firstDivergentTick(['a', 'b'], ['a'])).toBe(1);
    });
});
