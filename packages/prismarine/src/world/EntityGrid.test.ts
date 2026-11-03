import { describe, expect, it } from 'vitest';

import type { Entity } from '../entity/Entity';
import { stub } from '../testing/stub.test.helper';
import { Position } from './Position';
import type { World } from './World';
import EntityGrid from './EntityGrid';

/** An item stand-in whose position can move as a live entity does. */
const itemAt = (id: number, x: number, z: number) => {
    const world = stub<World>({ getName: () => 'test' });
    let position = new Position(x, 64, z, world);
    const entity = stub<Entity>({
        getRuntimeId: () => BigInt(id),
        getType: () => 'minecraft:item',
        getPosition: () => position
    });
    return {
        entity,
        move: (nextX: number, nextZ: number) => {
            position = new Position(nextX, 64, nextZ, world);
        }
    };
};

/** An entity stand-in for exercising the coarse candidate grid. */
const entityAt = (id: number, x: number, z: number) => {
    const world = stub<World>({ getName: () => 'test' });
    const position = new Position(x, 64, z, world);
    return stub<Entity>({
        getRuntimeId: () => BigInt(id),
        getType: () => 'minecraft:cow',
        getPosition: () => position
    });
};

describe('EntityGrid pickup item index', () => {
    it('selects horizontal candidates across negative cell boundaries in insertion order', () => {
        const later = itemAt(1, 0.9, -0.1);
        const earlier = itemAt(2, -1.1, -0.1);
        const outside = itemAt(3, 2.1, -0.1);
        const grid = new EntityGrid();
        grid.rebuild([later.entity, earlier.entity, outside.entity]);

        expect(grid.nearItemsForPickup(-0.1, -0.1, 1)).toEqual([later.entity, earlier.entity]);
        expect(grid.nearItemsForPickup(-0.1, -0.1, -1)).toEqual([]);
    });

    it('tracks same-tick item movement, addition, and removal', () => {
        const moved = itemAt(1, 0.5, 0.5);
        const remaining = itemAt(2, -0.5, 0.5);
        const grid = new EntityGrid();
        grid.rebuild([moved.entity, remaining.entity]);

        moved.move(20.5, 0.5);
        grid.refilePickupItem(moved.entity);
        const added = itemAt(3, 0.25, 0.25);
        grid.add(added.entity);
        expect(grid.nearItemsForPickup(0, 0, 1)).toEqual([remaining.entity, added.entity]);

        grid.remove(remaining.entity);
        expect(grid.nearItemsForPickup(0, 0, 1)).toEqual([added.entity]);
    });

    it('keeps coarse candidates in chunk traversal and insertion order at negative and fallback coordinates', () => {
        const negativeCorner = entityAt(1, -1, -1);
        const negativeEdgeFirst = entityAt(2, -1, 0);
        const negativeEdgeSecond = entityAt(3, -2, 0);
        const west = entityAt(4, -16, 0);
        const origin = entityAt(5, 0, 0);
        const north = entityAt(6, 0, -16);
        const east = entityAt(7, 16, 0);
        const outside = entityAt(8, -17, 0);
        const grid = new EntityGrid();
        grid.rebuild([origin, negativeCorner, negativeEdgeFirst, negativeEdgeSecond, west, north, east, outside]);

        expect(grid.near(0, 0)).toEqual([
            negativeCorner,
            negativeEdgeFirst,
            negativeEdgeSecond,
            west,
            north,
            origin,
            east
        ]);

        const farFirst = entityAt(9, 536_870_896, 536_870_896);
        const farSecond = entityAt(10, 536_870_912, 536_870_912);
        grid.rebuild([farFirst, farSecond]);
        expect(grid.near(536_870_896, 536_870_896)).toEqual([farFirst, farSecond]);
    });

    it('keeps item cells distinct when coordinates need the exact fallback key', () => {
        const far = itemAt(1, 67_108_862, -67_108_866);
        const neighbor = itemAt(2, 67_108_864, -67_108_866);
        const grid = new EntityGrid();
        grid.rebuild([far.entity, neighbor.entity]);

        expect(grid.nearItemsForPickup(67_108_862, -67_108_866, 0)).toEqual([far.entity]);
        expect(grid.nearItemsForPickup(67_108_862, -67_108_866, 2)).toEqual([far.entity, neighbor.entity]);
    });
});
