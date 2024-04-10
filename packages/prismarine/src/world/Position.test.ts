import { describe, expect, it, vi } from 'vitest';
import Position from './Position';
import type Server from '../Server';
import type World from './World';

describe('world', () => {
    describe('Position', () => {
        const world: World = vi.fn().mockImplementation(() => ({
            getName: () => 'test-world'
        }))();
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {}
            }),
            getWorldManager: () => ({
                getDefaultWorld: () => world
            })
        }))();

        it('should create a new position with the given data', () => {
            const positionData = {
                x: 1,
                y: 2,
                z: 3,
                world,
                server
            };
            const position = new Position(positionData);
            expect(position).toBeInstanceOf(Position);
            expect(position.getX()).toBe(positionData.x);
            expect(position.getY()).toBe(positionData.y);
            expect(position.getZ()).toBe(positionData.z);
            expect(position.getWorld()).toBe(positionData.world);
        });

        it('should return the default world if no world is set', () => {
            const positionData = {
                x: 1,
                y: 2,
                z: 3,
                server
            };
            const position = new Position(positionData);
            const defaultWorld = world;
            expect(position.getWorld()).toBe(defaultWorld);
        });

        it('should set the world of the position', async () => {
            const positionData = {
                x: 1,
                y: 2,
                z: 3,
                server
            };
            const position = new Position(positionData);
            const newWorld = world;
            await position.setWorld(newWorld);
            expect(position.getWorld()).toBe(newWorld);
        });
    });
});
