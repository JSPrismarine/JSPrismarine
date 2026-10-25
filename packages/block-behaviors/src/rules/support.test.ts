import type { BlockPosition } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { AIR } from '../identifiers';
import { createVoxelWorld } from '../voxelWorld';
import { breakBlock, isSolidSupport, popBlock, popWithoutGround, popWithoutSupport } from './support';

const origin = { x: 0, y: 1, z: 0 };
const below = { x: 0, y: 0, z: 0 };

describe('isSolidSupport', () => {
    it('counts a full block and refuses air, liquids and blocks a piston pops', () => {
        const world = createVoxelWorld().overworld;
        world.defineProperties('minecraft:torch', { pushReaction: 'popped' });
        world.set({ x: 0, y: 0, z: 0 }, 'minecraft:stone');
        world.set({ x: 1, y: 0, z: 0 }, 'minecraft:water');
        world.set({ x: 2, y: 0, z: 0 }, 'minecraft:torch');

        expect(isSolidSupport(world, { x: 0, y: 0, z: 0 })).toBe(true);
        expect(isSolidSupport(world, { x: 1, y: 0, z: 0 })).toBe(false);
        expect(isSolidSupport(world, { x: 2, y: 0, z: 0 })).toBe(false);
        expect(isSolidSupport(world, { x: 3, y: 0, z: 0 })).toBe(false);
    });
});

describe('breakBlock', () => {
    it('clears the position, drops what it was given and notifies the neighbors', () => {
        const world = createVoxelWorld().overworld;
        world.set(origin, 'minecraft:coal_ore');

        breakBlock(world, world.block(origin), [{ identifier: 'minecraft:coal', count: 1 }]);

        expect(world.identifierAt(origin)).toBe(AIR);
        expect(world.drops).toEqual([{ position: origin, drop: { identifier: 'minecraft:coal', count: 1 } }]);
        expect(world.notified).toEqual([origin]);
    });
});

describe('popBlock', () => {
    it('lets a world with Java’s tables decide what the popped block leaves', () => {
        const world = createVoxelWorld().overworld;
        world.set(origin, 'minecraft:stone');

        const destroyed: BlockPosition[] = [];
        const rolling = Object.assign(world, {
            destroyBlock: (position: BlockPosition) => {
                destroyed.push(position);
                return true;
            }
        });

        popBlock(rolling, world.block(origin));

        // The world took the drops, so the family adds none of its own: stone yields
        // cobblestone and one of itself would be wrong.
        expect(destroyed).toEqual([origin]);
        expect(world.drops).toEqual([]);
        expect(world.identifierAt(origin)).toBe(AIR);
    });

    it('drops one of the block where the world has no table to roll', () => {
        const world = createVoxelWorld().overworld;
        world.set(origin, 'minecraft:torch');

        popBlock(world, world.block(origin));

        expect(world.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:torch']);
    });
});

describe('popWithoutSupport', () => {
    it('leaves a supported block alone and pops an unsupported one', () => {
        const world = createVoxelWorld().overworld;
        world.set(below, 'minecraft:stone');
        world.set(origin, 'minecraft:torch');

        expect(popWithoutSupport(world, world.block(origin))).toBe(false);

        world.set(below, AIR);

        expect(popWithoutSupport(world, world.block(origin))).toBe(true);
        expect(world.identifierAt(origin)).toBe(AIR);
        expect(world.drops.map((entry) => entry.drop.identifier)).toEqual(['minecraft:torch']);
    });

    it('checks the face it is told to', () => {
        const world = createVoxelWorld().overworld;
        world.set({ x: 0, y: 1, z: -1 }, 'minecraft:stone');
        world.set(origin, 'minecraft:ladder');

        expect(popWithoutSupport(world, world.block(origin), 'north')).toBe(false);
        expect(popWithoutSupport(world, world.block(origin), 'south')).toBe(true);
    });
});

describe('popWithoutGround', () => {
    it('accepts only the named ground blocks', () => {
        const world = createVoxelWorld().overworld;
        world.set(below, 'minecraft:farmland');
        world.set(origin, 'minecraft:wheat');

        expect(popWithoutGround(world, world.block(origin), new Set(['farmland']))).toBe(false);

        world.set(below, 'minecraft:stone');

        expect(popWithoutGround(world, world.block(origin), new Set(['farmland']))).toBe(true);
    });
});
