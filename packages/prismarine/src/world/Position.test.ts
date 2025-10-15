import { describe, expect, it, vi } from 'vitest';
import type { World } from './';
import { Position } from './';

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

        it('should set the world of the position', async () => {
            const position = new Position(1, 2, 3, world);
            const newWorld = world;
            position.setWorld(newWorld);
            expect(position.getWorld()).toBe(newWorld);
        });
    });
});
