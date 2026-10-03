import { describe, expect, it } from 'vitest';

import { Vector3 } from './Vector3';

describe('math', () => {
    describe('Vector3', () => {
        const vector = new Vector3(1.5, 0, 2.75);

        it('should retrieve values correctly', () => {
            expect(vector.getX()).toBe(1.5);
            expect(vector.getY()).toBe(0);
            expect(vector.getZ()).toBe(2.75);
        });

        it('should derive a vector with a different coordinate', () => {
            expect(vector.withX(10).getX()).toBe(10);
            expect(vector.withY(10).getY()).toBe(10);
            expect(vector.withZ(10).getZ()).toBe(10);
        });

        it('should leave the original untouched when deriving', () => {
            const derived = vector.withY(10);

            expect(derived.getY()).toBe(10);
            expect(vector.getY()).toBe(0);
            expect(derived.getX()).toBe(vector.getX());
            expect(derived.getZ()).toBe(vector.getZ());
        });

        it('should keep the concrete class when deriving', () => {
            class Tagged extends Vector3 {}

            const tagged = new Tagged(1, 2, 3);

            expect(tagged.withY(10)).toBeInstanceOf(Tagged);
            expect(tagged.floor()).toBeInstanceOf(Tagged);
        });

        it('should floor the vector correctly', () => {
            const flooredVector = new Vector3(1.5, 0, 2.75).floor();
            expect(flooredVector.getX()).toBe(1);
            expect(flooredVector.getY()).toBe(0);
            expect(flooredVector.getZ()).toBe(2);
        });

        it('should compare two vectors correctly', () => {
            const vector1 = new Vector3(1, 2, 3);
            const vector2 = new Vector3(1, 2, 3);
            const vector3 = new Vector3(4, 5, 6);

            expect(vector1.equals(vector2)).toBe(true);
            expect(vector1.equals(vector3)).toBe(false);
        });

        it('should compare coordinates only, ignoring subclass state', () => {
            // A subclass holding a reference back into the object graph used to throw here:
            // equality went through JSON.stringify, which walked into the circular structure.
            class Anchored extends Vector3 {
                public constructor(
                    x: number,
                    y: number,
                    z: number,
                    public readonly anchor: unknown
                ) {
                    super(x, y, z);
                }
            }

            const circular: Record<string, unknown> = {};
            circular.self = circular;

            expect(new Anchored(1, 2, 3, circular).equals(new Vector3(1, 2, 3))).toBe(true);
            expect(new Anchored(1, 2, 3, circular).equals(new Vector3(4, 5, 6))).toBe(false);
        });
    });
});
