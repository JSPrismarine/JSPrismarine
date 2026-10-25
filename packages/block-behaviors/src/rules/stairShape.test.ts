import type { BlockPosition } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { WEIRDO_DIRECTIONS } from '../geometry';
import type { VoxelDimension } from '../voxelWorld';
import { createVoxelWorld } from '../voxelWorld';
import type { StairCorner } from './stairShape';
import { isStairs, stairCorner, stairFacing } from './stairShape';

type StairFace = (typeof WEIRDO_DIRECTIONS)[number];

const center = { x: 0, y: 0, z: 0 };

const putStairs = (world: VoxelDimension, position: BlockPosition, facing: StairFace): void => {
    world.set(position, 'minecraft:oak_stairs', {
        weirdo_direction: WEIRDO_DIRECTIONS.indexOf(facing),
        upside_down_bit: false,
        'minecraft:corner': 'none'
    });
};

const cornerWith = (neighbors: readonly { position: BlockPosition; facing: StairFace }[]): StairCorner => {
    const world = createVoxelWorld().overworld;
    putStairs(world, center, 'east');
    for (const neighbor of neighbors) putStairs(world, neighbor.position, neighbor.facing);
    return stairCorner(world, world.block(center));
};

describe('stairFacing', () => {
    it('reads weirdo_direction as east, west, south and north', () => {
        const world = createVoxelWorld().overworld;
        for (const [value, face] of WEIRDO_DIRECTIONS.entries()) {
            world.set(center, 'minecraft:oak_stairs', { weirdo_direction: value });
            expect(stairFacing(world.block(center))).toBe(face);
        }
    });
});

describe('isStairs', () => {
    it('matches any stair identifier and nothing else', () => {
        expect(isStairs('minecraft:oak_stairs')).toBe(true);
        expect(isStairs('minecraft:exposed_cut_copper_stairs')).toBe(true);
        expect(isStairs('minecraft:oak_slab')).toBe(false);
    });
});

describe('stairCorner', () => {
    it('is none for a stair with no stairs around it', () => {
        expect(cornerWith([])).toBe('none');
    });

    it('is none for a straight run', () => {
        expect(
            cornerWith([
                { position: { x: 1, y: 0, z: 0 }, facing: 'east' },
                { position: { x: -1, y: 0, z: 0 }, facing: 'east' }
            ])
        ).toBe('none');
    });

    it('takes an outer corner from the stair in front', () => {
        expect(cornerWith([{ position: { x: 1, y: 0, z: 0 }, facing: 'north' }])).toBe('outer_left');
        expect(cornerWith([{ position: { x: 1, y: 0, z: 0 }, facing: 'south' }])).toBe('outer_right');
    });

    it('takes an inner corner from the stair behind', () => {
        expect(cornerWith([{ position: { x: -1, y: 0, z: 0 }, facing: 'north' }])).toBe('inner_left');
        expect(cornerWith([{ position: { x: -1, y: 0, z: 0 }, facing: 'south' }])).toBe('inner_right');
    });

    it('prefers the stair in front over the one behind', () => {
        expect(
            cornerWith([
                { position: { x: 1, y: 0, z: 0 }, facing: 'north' },
                { position: { x: -1, y: 0, z: 0 }, facing: 'south' }
            ])
        ).toBe('outer_left');
    });

    it('refuses the outer corner when a matching stair continues the run', () => {
        expect(
            cornerWith([
                { position: { x: 1, y: 0, z: 0 }, facing: 'north' },
                { position: { x: 0, y: 0, z: 1 }, facing: 'east' }
            ])
        ).toBe('none');
    });

    it('ignores a stair in the other half of its block', () => {
        const world = createVoxelWorld().overworld;
        putStairs(world, center, 'east');
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:oak_stairs', {
            weirdo_direction: WEIRDO_DIRECTIONS.indexOf('north'),
            upside_down_bit: true,
            'minecraft:corner': 'none'
        });

        expect(stairCorner(world, world.block(center))).toBe('none');
    });
});
