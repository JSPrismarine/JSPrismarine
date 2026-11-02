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
});
