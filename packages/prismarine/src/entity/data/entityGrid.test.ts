import { describe, expect, it } from 'vitest';

import { EntityGrid } from './entityGrid';
import { FLOOR_Y, entityFixture } from './testing';

describe('EntityGrid', () => {
    it('answers in ascending runtime id order, whatever order entities were filed in', () => {
        const { runtime } = entityFixture();
        const lower = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        const higher = runtime.spawn('minecraft:cow', { x: 1.5, y: FLOOR_Y + 1, z: 0.5 });
        if (lower === undefined || higher === undefined) throw new Error('the fixture declares no cow');

        const grid = new EntityGrid();
        grid.add(higher);
        grid.add(lower);

        const center = { x: 1, y: FLOOR_Y + 1, z: 0.5 };
        expect(grid.within(center, 4)).toEqual([lower, higher]);
        expect(grid.withinBox({ x: -1, y: FLOOR_Y, z: -1 }, { x: 3, y: FLOOR_Y + 3, z: 2 })).toEqual([lower, higher]);
    });
});
