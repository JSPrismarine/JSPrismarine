import { describe, expect, it, vi } from 'vitest';
import type { World } from './';
import { Position } from './Position';

describe('world', () => {
    describe('Position', () => {
        const world: World = vi.fn().mockImplementation(() => ({
            getName: () => 'test-world'
        }))();

        it('should create a new position with the given data', () => {
            const position = new Position(1, 2, 3, world);
            expect(position).toBeInstanceOf(Position);
            expect(position.getX()).toBe(1);
            expect(position.getY()).toBe(2);
            expect(position.getZ()).toBe(3);
            expect(position.getWorld()).toBe(world);
        });

        it('should refuse to exist without a world', () => {
            // The invariant the class is for. It used to be checked on the way out of
            // `getWorld()`, which let a worldless position be built and passed around, and
            // blamed whichever unrelated read happened to touch it first.
            expect(() => new Position(1, 2, 3, undefined as unknown as World)).toThrow(/requires the world/);
        });

        it('should move to another world without altering the original', () => {
            const position = new Position(1, 2, 3, world);
            const elsewhere: World = vi.fn().mockImplementation(() => ({
                getName: () => 'other-world'
            }))();

            const moved = position.withWorld(elsewhere);

            expect(moved.getWorld()).toBe(elsewhere);
            expect(moved.getX()).toBe(1);
            expect(moved.getY()).toBe(2);
            expect(moved.getZ()).toBe(3);
            expect(position.getWorld()).toBe(world);
        });

        it('should keep its world when a coordinate is changed', () => {
            // Derived instances go through the base class, which knows nothing about worlds;
            // without the hook that reattaches it, `withY` would hand back a bare vector.
            const moved = new Position(1, 2, 3, world).withY(10);

            expect(moved).toBeInstanceOf(Position);
            expect(moved.getY()).toBe(10);
            expect(moved.getWorld()).toBe(world);
        });
    });
});
