import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import { connectionStates, connectsTo, wallStates } from './connection';

const center = { x: 0, y: 0, z: 0 };

const fenceStates = {
    'minecraft:connection_north': false,
    'minecraft:connection_south': false,
    'minecraft:connection_west': false,
    'minecraft:connection_east': false
};

describe('connectsTo', () => {
    it('joins a fence to another fence of the same group and to a solid block', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:oak_fence', fenceStates);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:spruce_fence');
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');

        expect(connectsTo(world, 'fence', world.block(center), 'north')).toBe(true);
        expect(connectsTo(world, 'fence', world.block(center), 'east')).toBe(true);
        expect(connectsTo(world, 'fence', world.block(center), 'west')).toBe(false);
    });

    it('keeps a nether brick fence out of the wooden group, both ways', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:oak_fence', fenceStates);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:nether_brick_fence');

        expect(connectsTo(world, 'fence', world.block(center), 'north')).toBe(false);

        world.set(center, 'minecraft:nether_brick_fence', fenceStates);

        expect(connectsTo(world, 'fence', world.block(center), 'north')).toBe(true);
    });

    it('joins a fence to a gate and a wall but not to a pane', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:oak_fence', fenceStates);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:fence_gate');
        world.set({ x: 0, y: 0, z: 1 }, 'minecraft:cobblestone_wall');
        world.set({ x: -1, y: 0, z: 0 }, 'minecraft:glass_pane');

        expect(connectsTo(world, 'fence', world.block(center), 'north')).toBe(true);
        expect(connectsTo(world, 'fence', world.block(center), 'south')).toBe(true);
        expect(connectsTo(world, 'fence', world.block(center), 'west')).toBe(false);
    });

    it('joins a pane to bars and refuses a fence', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:glass_pane', fenceStates);
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:iron_bars');
        world.set({ x: -1, y: 0, z: 0 }, 'minecraft:oak_fence');

        expect(connectsTo(world, 'pane', world.block(center), 'east')).toBe(true);
        expect(connectsTo(world, 'pane', world.block(center), 'west')).toBe(false);
    });
});

describe('connectionStates', () => {
    it('writes one flag per direction the block carries', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:oak_fence', fenceStates);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:oak_fence', fenceStates);

        expect(connectionStates(world, 'fence', world.block(center))).toEqual({
            'minecraft:connection_north': true,
            'minecraft:connection_south': false,
            'minecraft:connection_west': false,
            'minecraft:connection_east': false
        });
    });

    it('writes nothing for a block whose palette entry has no connection states', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:oak_fence');

        expect(connectionStates(world, 'fence', world.block(center))).toEqual({});
    });
});

describe('wallStates', () => {
    const wall = {
        wall_connection_type_north: 'none',
        wall_connection_type_south: 'none',
        wall_connection_type_west: 'none',
        wall_connection_type_east: 'none',
        wall_post_bit: false
    };

    it('is short with nothing above and a post when the run is not straight', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:cobblestone_wall', wall);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:cobblestone_wall', wall);

        expect(wallStates(world, world.block(center))).toMatchObject({
            wall_connection_type_north: 'short',
            wall_connection_type_south: 'none',
            wall_post_bit: true
        });
    });

    it('drops the post for a straight run through the block', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:cobblestone_wall', wall);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:cobblestone_wall', wall);
        world.set({ x: 0, y: 0, z: 1 }, 'minecraft:cobblestone_wall', wall);

        expect(wallStates(world, world.block(center))).toMatchObject({ wall_post_bit: false });
    });

    it('goes tall and keeps the post when a solid block sits on it', () => {
        const world = createVoxelWorld().overworld;
        world.set(center, 'minecraft:cobblestone_wall', wall);
        world.set({ x: 0, y: 0, z: -1 }, 'minecraft:cobblestone_wall', wall);
        world.set({ x: 0, y: 0, z: 1 }, 'minecraft:cobblestone_wall', wall);
        world.set({ x: 0, y: 1, z: 0 }, 'minecraft:stone');

        expect(wallStates(world, world.block(center))).toMatchObject({
            wall_connection_type_north: 'tall',
            wall_post_bit: true
        });
    });
});
