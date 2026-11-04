import { describe, expect, it } from 'vitest';

import { hasNeighborSignal } from './signal';
import { createTestWorld } from './testWorld';
import { block } from './world';

describe('a lever powering the block it hangs on', () => {
    const stone = { x: 0, y: 1, z: 2 };
    const lever = { x: 0, y: 1, z: 1 };
    const aboveStone = { x: 0, y: 2, z: 2 };

    const world = (open: boolean, leverDirection: string) => {
        const arranged = createTestWorld();
        arranged.place(stone, block('minecraft:stone'));
        arranged.place(lever, block('minecraft:lever', { open_bit: open, lever_direction: leverDirection }));
        return arranged;
    };

    it('reaches a block resting on the support block when the lever is on', () => {
        // `north` hangs the lever on the block to its south, which is the stone.
        expect(hasNeighborSignal(world(true, 'north'), aboveStone)).toBe(true);
    });

    it('gives that block nothing while the lever is off', () => {
        expect(hasNeighborSignal(world(false, 'north'), aboveStone)).toBe(false);
    });

    it('does not power a block next to a lever that hangs on a different block', () => {
        // `south` hangs the lever on the block to its north, so the stone is not its support.
        expect(hasNeighborSignal(world(true, 'south'), aboveStone)).toBe(false);
    });
});
