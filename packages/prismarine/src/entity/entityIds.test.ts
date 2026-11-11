import { describe, expect, it } from 'vitest';

import { EntityIdAllocator } from './entityIds';

describe('entity', () => {
    describe('EntityIdAllocator', () => {
        it('counts up from the last id it handed out', () => {
            const ids = new EntityIdAllocator(41);
            expect([ids.next(), ids.next()]).toEqual([42, 43]);
        });

        it('stops allocating runtime ids before numeric map keys lose precision', () => {
            const ids = new EntityIdAllocator(Number.MAX_SAFE_INTEGER - 1);
            expect(ids.next()).toBe(Number.MAX_SAFE_INTEGER);
            expect(() => ids.next()).toThrow(RangeError);
        });
    });
});
