import { describe, expect, it } from 'vitest';

import { createNeighborUpdates } from './neighborUpdates';
import type { BlockPosition, Direction } from './world';
import { positionKey } from './world';

const origin: BlockPosition = { x: 0, y: 0, z: 0 };

describe('createNeighborUpdates', () => {
    it('tells all six neighbors in Direction.values() order', () => {
        const seen: string[] = [];
        const updates = createNeighborUpdates({
            onNeighborChanged: (at) => seen.push(positionKey(at)),
            onShapeUpdate: () => {}
        });

        updates.updateNeighborsAt(origin, 'minecraft:stone');

        expect(seen).toEqual(['0,-1,0', '0,1,0', '0,0,-1', '0,0,1', '-1,0,0', '1,0,0']);
    });

    it('skips the one direction updateNeighborsAtExceptFromFacing names', () => {
        const seen: string[] = [];
        const updates = createNeighborUpdates({
            onNeighborChanged: (at) => seen.push(positionKey(at)),
            onShapeUpdate: () => {}
        });

        updates.updateNeighborsAtExceptFromFacing(origin, 'minecraft:stone', 'up');

        expect(seen).toEqual(['0,-1,0', '0,0,-1', '0,0,1', '-1,0,0', '1,0,0']);
    });

    it('runs an update raised during an update before the outer one continues', () => {
        const seen: string[] = [];
        let nested = false;
        const updates = createNeighborUpdates({
            onNeighborChanged: (at) => {
                seen.push(positionKey(at));
                if (!nested && at.y === -1) {
                    nested = true;
                    updates.neighborChanged({ x: 9, y: 9, z: 9 }, 'minecraft:stone');
                }
            },
            onShapeUpdate: () => {}
        });

        updates.updateNeighborsAt(origin, 'minecraft:stone');

        // The nested update lands second, before the outer walk reaches 'up'.
        expect(seen.slice(0, 3)).toEqual(['0,-1,0', '9,9,9', '0,1,0']);
    });

    it('hands each neighbor the direction back toward the block that changed', () => {
        const seen: [string, Direction][] = [];
        const updates = createNeighborUpdates({
            onNeighborChanged: () => {},
            onShapeUpdate: (at, fromDirection) => seen.push([positionKey(at), fromDirection])
        });

        updates.shapeUpdatesAround(origin);

        // `UPDATE_SHAPE_ORDER` is west, east, down, up, north, south.
        expect(seen).toEqual([
            ['-1,0,0', 'east'],
            ['1,0,0', 'west'],
            ['0,-1,0', 'up'],
            ['0,1,0', 'down'],
            ['0,0,-1', 'south'],
            ['0,0,1', 'north']
        ]);
    });

    it('drops updates past the chain limit instead of running forever', () => {
        let count = 0;
        const updates = createNeighborUpdates(
            {
                onNeighborChanged: (at) => {
                    count++;
                    updates.neighborChanged({ x: at.x + 1, y: 0, z: 0 }, 'minecraft:stone');
                },
                onShapeUpdate: () => {}
            },
            5
        );

        updates.neighborChanged(origin, 'minecraft:stone');

        expect(count).toBe(5);
    });
});
