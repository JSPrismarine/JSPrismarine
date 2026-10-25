import { describe, expect, it } from 'vitest';

import { createVoxelWorld } from '../voxelWorld';
import type { ItemDrop } from '../world';
import { containerSignal, emptyContainer, MAX_STACK_SIZE, slotsOf, spillContainer } from './container';

const stack = (count: number): ItemDrop => ({ identifier: 'minecraft:stone', count });

describe('slotsOf', () => {
    it('knows the slot count of each container and folds the dyed shulker boxes together', () => {
        expect(slotsOf('minecraft:chest')).toBe(27);
        expect(slotsOf('minecraft:hopper')).toBe(5);
        expect(slotsOf('minecraft:dropper')).toBe(9);
        expect(slotsOf('minecraft:magenta_shulker_box')).toBe(27);
        expect(slotsOf('minecraft:decorated_pot')).toBe(1);
    });
});

describe('emptyContainer', () => {
    it('starts with one empty slot per capacity', () => {
        const data = emptyContainer('minecraft:hopper');

        expect(data.capacity).toBe(5);
        expect(data.items).toHaveLength(5);
        expect(data.items?.every((item) => item === undefined)).toBe(true);
    });
});

describe('containerSignal', () => {
    it('is 0 when empty and 15 when every slot is a full stack', () => {
        expect(containerSignal(emptyContainer('minecraft:chest'))).toBe(0);
        expect(containerSignal({ capacity: 27, items: new Array(27).fill(stack(MAX_STACK_SIZE)) })).toBe(15);
    });

    it('is 1 for a single item, which is what a comparator reads off one arrow', () => {
        expect(containerSignal({ capacity: 27, items: [stack(1)] })).toBe(1);
    });

    it('rises with the fill level', () => {
        const half = containerSignal({ capacity: 27, items: new Array(14).fill(stack(MAX_STACK_SIZE)) });

        expect(half).toBeGreaterThan(1);
        expect(half).toBeLessThan(15);
    });

    it('is 0 for a block with no block entity', () => {
        expect(containerSignal(undefined)).toBe(0);
    });
});

describe('spillContainer', () => {
    it('drops every filled slot and nothing for the empty ones', () => {
        const world = createVoxelWorld().overworld;
        const position = { x: 0, y: 0, z: 0 };
        world.set(position, 'minecraft:chest');
        world.setBlockData(position, { capacity: 3, items: [stack(2), undefined, stack(5)] });

        spillContainer(world, world.block(position));

        expect(world.drops.map((entry) => entry.drop.count)).toEqual([2, 5]);
    });
});
