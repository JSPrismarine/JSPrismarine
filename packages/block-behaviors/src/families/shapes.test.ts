import { describe, expect, it } from 'vitest';

import { WEIRDO_DIRECTIONS } from '../geometry';
import { bindFamily } from '../harness';
import {
    doubleSlabFamily,
    doubleSlabName,
    fenceFamily,
    singleSlabName,
    slabFamily,
    stairsFamily,
    wallFamily
} from './shapes';

const position = { x: 0, y: 0, z: 0 };

describe('doubleSlabName and singleSlabName', () => {
    it('round-trip the regular and the two legacy spellings', () => {
        expect(doubleSlabName('minecraft:oak_slab')).toBe('minecraft:oak_double_slab');
        expect(singleSlabName('minecraft:oak_double_slab')).toBe('minecraft:oak_slab');
        expect(doubleSlabName('minecraft:stone_block_slab')).toBe('minecraft:double_stone_block_slab');
        expect(singleSlabName('minecraft:double_stone_block_slab')).toBe('minecraft:stone_block_slab');
        expect(doubleSlabName('minecraft:wooden_slab')).toBe('minecraft:double_wooden_slab');
    });
});

describe('slabFamily', () => {
    it('merges with the slab it replaced in the other half', () => {
        const harness = bindFamily(slabFamily, 'minecraft:oak_slab');
        harness.dimension.set(position, 'minecraft:oak_slab', { 'minecraft:vertical_half': 'bottom' });

        harness.place(position, {
            previous: { identifier: 'minecraft:oak_slab', states: { 'minecraft:vertical_half': 'top' } }
        });

        expect(harness.dimension.identifierAt(position)).toBe('minecraft:oak_double_slab');
        expect(harness.dimension.stateAt(position, 'minecraft:vertical_half')).toBe('bottom');
    });

    it('does not merge with the same half or with another slab', () => {
        const harness = bindFamily(slabFamily, 'minecraft:oak_slab');
        harness.dimension.set(position, 'minecraft:oak_slab', { 'minecraft:vertical_half': 'top' });

        harness.place(position, {
            previous: { identifier: 'minecraft:oak_slab', states: { 'minecraft:vertical_half': 'top' } }
        });

        expect(harness.dimension.identifierAt(position)).toBe('minecraft:oak_slab');
    });
});

describe('doubleSlabFamily', () => {
    it('drops two of the slab it is made of', () => {
        const harness = bindFamily(doubleSlabFamily, 'minecraft:oak_double_slab');
        harness.dimension.set(position, 'minecraft:oak_double_slab');

        harness.breakBlock(position);

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:oak_slab', count: 2 }
        ]);
    });
});

describe('stairsFamily', () => {
    const stairStates = (facing: (typeof WEIRDO_DIRECTIONS)[number]) => ({
        weirdo_direction: WEIRDO_DIRECTIONS.indexOf(facing),
        upside_down_bit: false,
        'minecraft:corner': 'none'
    });

    it('takes an outer corner from the stair in front when a neighbor changes', () => {
        const harness = bindFamily(stairsFamily, 'minecraft:oak_stairs');
        harness.dimension.set(position, 'minecraft:oak_stairs', stairStates('east'));
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:oak_stairs', stairStates('north'));

        harness.neighborChanged(position, 'east');

        expect(harness.dimension.stateAt(position, 'minecraft:corner')).toBe('outer_left');
    });

    it('sets the corner on placement too', () => {
        const harness = bindFamily(stairsFamily, 'minecraft:oak_stairs');
        harness.dimension.set(position, 'minecraft:oak_stairs', stairStates('east'));
        harness.dimension.set({ x: -1, y: 0, z: 0 }, 'minecraft:oak_stairs', stairStates('south'));

        harness.place(position);

        expect(harness.dimension.stateAt(position, 'minecraft:corner')).toBe('inner_right');
    });
});

describe('fenceFamily', () => {
    const connections = {
        'minecraft:connection_north': false,
        'minecraft:connection_south': false,
        'minecraft:connection_west': false,
        'minecraft:connection_east': false
    };

    it('connects to the fence beside it and to a solid block', () => {
        const harness = bindFamily(fenceFamily, 'minecraft:oak_fence');
        harness.dimension.set(position, 'minecraft:oak_fence', connections);
        harness.dimension.set({ x: 0, y: 0, z: -1 }, 'minecraft:oak_fence', connections);
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:stone');

        harness.neighborChanged(position, 'north');

        expect(harness.dimension.stateAt(position, 'minecraft:connection_north')).toBe(true);
        expect(harness.dimension.stateAt(position, 'minecraft:connection_east')).toBe(true);
        expect(harness.dimension.stateAt(position, 'minecraft:connection_west')).toBe(false);
    });

    it('refuses the other fence group', () => {
        const harness = bindFamily(fenceFamily, 'minecraft:oak_fence');
        harness.dimension.set(position, 'minecraft:oak_fence', connections);
        harness.dimension.set({ x: 0, y: 0, z: -1 }, 'minecraft:nether_brick_fence', connections);

        harness.neighborChanged(position, 'north');

        expect(harness.dimension.stateAt(position, 'minecraft:connection_north')).toBe(false);
    });

    it('gives iron bars the pane rule, which refuses a fence', () => {
        const harness = bindFamily(fenceFamily, 'minecraft:iron_bars');
        harness.dimension.set(position, 'minecraft:iron_bars', connections);
        harness.dimension.set({ x: 0, y: 0, z: -1 }, 'minecraft:oak_fence', connections);
        harness.dimension.set({ x: 1, y: 0, z: 0 }, 'minecraft:iron_bars', connections);

        harness.neighborChanged(position, 'north');

        expect(harness.dimension.stateAt(position, 'minecraft:connection_north')).toBe(false);
        expect(harness.dimension.stateAt(position, 'minecraft:connection_east')).toBe(true);
    });
});

describe('wallFamily', () => {
    const wall = {
        wall_connection_type_north: 'none',
        wall_connection_type_south: 'none',
        wall_connection_type_west: 'none',
        wall_connection_type_east: 'none',
        wall_post_bit: false
    };

    it('goes tall under a solid block', () => {
        const harness = bindFamily(wallFamily, 'minecraft:cobblestone_wall');
        harness.dimension.set(position, 'minecraft:cobblestone_wall', wall);
        harness.dimension.set({ x: 0, y: 0, z: -1 }, 'minecraft:cobblestone_wall', wall);
        harness.dimension.set({ x: 0, y: 1, z: 0 }, 'minecraft:stone');

        harness.neighborChanged(position, 'north');

        expect(harness.dimension.stateAt(position, 'wall_connection_type_north')).toBe('tall');
        expect(harness.dimension.stateAt(position, 'wall_post_bit')).toBe(true);
    });
});
