import { describe, expect, it } from 'vitest';

import { urgencyAround } from './urgencyAround';

const keyOf = (x: number, z: number): string => `${x},${z}`;

describe('urgencyAround', () => {
    it('gives a neighbor the band of the most urgent chunk that reads it', () => {
        const urgencies = new Map([
            [keyOf(2, 0), 'immediate' as const],
            [keyOf(-1, 1), 'idle' as const]
        ]);

        expect(urgencyAround(urgencies, keyOf, 0, 0, 2)).toBe('immediate');
        expect(urgencyAround(urgencies, keyOf, 0, 0, 1)).toBe('idle');
    });

    it('is soon when nobody nearby was asked for, as a chunk built for a neighbor always was', () => {
        expect(urgencyAround(new Map(), keyOf, 5, 5, 2)).toBe('soon');
        expect(urgencyAround(new Map([[keyOf(9, 9), 'immediate' as const]]), keyOf, 0, 0, 2)).toBe('soon');
    });

    it('lets an idle request keep its band when nothing more urgent is near', () => {
        expect(urgencyAround(new Map([[keyOf(0, 0), 'idle' as const]]), keyOf, 0, 0, 2)).toBe('idle');
    });
});
