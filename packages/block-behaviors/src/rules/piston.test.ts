import { describe, expect, it } from 'vitest';

import { AIR } from '../identifiers';
import type { VoxelDimension } from '../voxelWorld';
import { createVoxelWorld } from '../voxelWorld';
import { performPull, performPush, PISTON_PUSH_LIMIT, planPush } from './piston';

const piston = { x: 0, y: 0, z: 0 };

const line = (world: VoxelDimension, length: number, identifier = 'minecraft:stone'): void => {
    for (let step = 1; step <= length; step += 1) world.set({ x: step, y: 0, z: 0 }, identifier);
};

describe('planPush', () => {
    it('moves a run up to the limit and refuses one block more', () => {
        const world = createVoxelWorld().overworld;
        line(world, PISTON_PUSH_LIMIT);

        expect(planPush(world, piston, 'east').moved).toHaveLength(PISTON_PUSH_LIMIT);

        world.set({ x: PISTON_PUSH_LIMIT + 1, y: 0, z: 0 }, 'minecraft:stone');

        expect(planPush(world, piston, 'east')).toMatchObject({ blocked: true, moved: [] });
    });

    it('stops on a block whose push reaction is immovable', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:obsidian', { pushReaction: 'immovable' });
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:obsidian');

        expect(planPush(world, piston, 'east')).toMatchObject({ blocked: true });
    });

    it('breaks a block whose push reaction is popped instead of moving it', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:torch', { pushReaction: 'popped' });
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:torch');

        expect(planPush(world, piston, 'east')).toMatchObject({
            blocked: false,
            destroyed: { x: 2, y: 0, z: 0 }
        });
    });
});

describe('performPush', () => {
    it('moves the whole run one position along, far end first', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:oak_log', { pillar_axis: 'x' });

        expect(performPush(world, piston, 'east')).toBe(true);
        expect(world.identifierAt({ x: 1, y: 0, z: 0 })).toBe(AIR);
        expect(world.identifierAt({ x: 2, y: 0, z: 0 })).toBe('minecraft:stone');
        expect(world.identifierAt({ x: 3, y: 0, z: 0 })).toBe('minecraft:oak_log');
        expect(world.stateAt({ x: 3, y: 0, z: 0 }, 'pillar_axis')).toBe('x');
    });

    it('drops the popped block and still moves the run', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:torch', { pushReaction: 'popped' });
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:torch');

        expect(performPush(world, piston, 'east')).toBe(true);
        expect(world.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:torch']);
        expect(world.identifierAt({ x: 2, y: 0, z: 0 })).toBe('minecraft:stone');
    });

    it('moves nothing when the run is blocked', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:bedrock', { pushReaction: 'immovable' });
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:bedrock');

        expect(performPush(world, piston, 'east')).toBe(false);
        expect(world.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:bedrock');
    });
});

describe('performPull', () => {
    it('brings back a block that can be pulled', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:stone');

        expect(performPull(world, piston, 'east')).toBe(true);
        expect(world.identifierAt({ x: 1, y: 0, z: 0 })).toBe('minecraft:stone');
        expect(world.identifierAt({ x: 2, y: 0, z: 0 })).toBe(AIR);
    });

    it('leaves behind a block that only pushes', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:white_glazed_terracotta', { pushReaction: 'push' });
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:white_glazed_terracotta');

        expect(performPull(world, piston, 'east')).toBe(false);
        expect(world.identifierAt({ x: 2, y: 0, z: 0 })).toBe('minecraft:white_glazed_terracotta');
    });

    it('has nothing to pull from an empty position', () => {
        const world = createVoxelWorld().overworld;

        expect(performPull(world, piston, 'east')).toBe(false);
    });
});
