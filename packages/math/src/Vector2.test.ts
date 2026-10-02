import { describe, expect, it } from 'vitest';

import { Vector2 } from './Vector2';

describe('math', () => {
    describe('Vector2', () => {
        const vector = new Vector2(1.5, 2.75);

        it('should retrieve values correctly', () => {
            expect(vector.getX()).toBe(1.5);
            expect(vector.getZ()).toBe(2.75);
        });

        it('should derive a vector with a different coordinate', () => {
            expect(vector.withX(10).getX()).toBe(10);
            expect(vector.withZ(10).getZ()).toBe(10);
        });

        it('should leave the original untouched when deriving', () => {
            const derived = vector.withX(10);

            expect(derived.getX()).toBe(10);
            expect(vector.getX()).toBe(1.5);
            expect(derived.getZ()).toBe(vector.getZ());
        });

        it('should floor the vector correctly', () => {
            const flooredVector = new Vector2(1.5, 2.75).floor();
            expect(flooredVector.getX()).toBe(1);
            expect(flooredVector.getZ()).toBe(2);
        });

        it('should compare two vectors correctly', () => {
            const vector1 = new Vector2(1, 3);
            const vector2 = new Vector2(1, 3);
            const vector3 = new Vector2(4, 6);

            expect(vector1.equals(vector2)).toBe(true);
            expect(vector1.equals(vector3)).toBe(false);
        });
    });
});
