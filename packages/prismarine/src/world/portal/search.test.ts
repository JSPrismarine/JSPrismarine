import type { PortalAxis } from '@jsprismarine/block-behaviors';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { PortalIndex } from './PortalIndex';
import type { BlockLookup, IndexedBlock, PortalRectangle } from './search';
import { exitPosition, exitYaw, findExitPortal, portalRectangleAround, relativePosition } from './search';

/** A world of nothing but the portal interiors a test writes. */
const blockWorld = () => {
    const blocks = new Map<string, IndexedBlock>();
    const index = new PortalIndex();
    const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

    /** Lights a portal interior with `minCorner` at the bottom negative end of `axis`. */
    const portal = (minCorner: { x: number; y: number; z: number }, axis: PortalAxis, width = 2, height = 3) => {
        for (let a = 0; a < width; a += 1) {
            for (let dy = 0; dy < height; dy += 1) {
                const x = axis === 'x' ? minCorner.x + a : minCorner.x;
                const z = axis === 'z' ? minCorner.z + a : minCorner.z;
                const y = minCorner.y + dy;
                blocks.set(key(x, y, z), { name: 'minecraft:portal', states: { portal_axis: axis } });
                index.add({ x, y, z });
            }
        }
    };

    const blockAt: BlockLookup = (at) => blocks.get(key(at.x, at.y, at.z)) ?? { name: 'minecraft:air', states: {} };
    return { portal, blockAt, index };
};

const PLAYER = { width: 0.6, height: 1.8 };

describe('portalRectangleAround', () => {
    it('recovers the whole interior from any block of it, with its axis', () => {
        const world = blockWorld();
        world.portal({ x: 10, y: 64, z: 5 }, 'x', 3, 4);

        const rectangle = portalRectangleAround(world.blockAt, { x: 12, y: 67, z: 5 });
        expect(rectangle).toEqual({ minCorner: new Vector3(10, 64, 5), axis: 'x', width: 3, height: 4 });
    });

    it('reads a z portal along z', () => {
        const world = blockWorld();
        world.portal({ x: 0, y: 70, z: -8 }, 'z');

        expect(portalRectangleAround(world.blockAt, { x: 0, y: 71, z: -7 })).toEqual({
            minCorner: new Vector3(0, 70, -8),
            axis: 'z',
            width: 2,
            height: 3
        });
    });

    it('answers nothing for a block that is no portal', () => {
        const world = blockWorld();
        expect(portalRectangleAround(world.blockAt, { x: 0, y: 0, z: 0 })).toBeUndefined();
    });
});

describe('findExitPortal', () => {
    it('finds the portal around the nearest indexed block, by Euclidean distance including y', () => {
        const world = blockWorld();
        world.portal({ x: 20, y: 64, z: 0 }, 'x');
        world.portal({ x: 0, y: 72, z: 0 }, 'x');

        const found = findExitPortal(world.index, world.blockAt, new Vector3(0, 64, 0), 128);
        expect(found?.minCorner).toEqual(new Vector3(0, 72, 0));
    });

    it('ignores a portal just outside the 128 block radius and takes one on its edge', () => {
        const world = blockWorld();
        world.portal({ x: 129, y: 64, z: 0 }, 'x');
        expect(findExitPortal(world.index, world.blockAt, new Vector3(0, 64, 0), 128)).toBeUndefined();

        world.portal({ x: 0, y: 64, z: 128 }, 'z');
        expect(findExitPortal(world.index, world.blockAt, new Vector3(0, 64, 0), 128)?.minCorner).toEqual(
            new Vector3(0, 64, 128)
        );
    });

    it('links both ends of a 21 block tall portal to the same rectangle, and keeps the height', () => {
        const world = blockWorld();
        world.portal({ x: 0, y: 40, z: 0 }, 'x', 2, 21);

        const low = findExitPortal(world.index, world.blockAt, new Vector3(5, 41, 0), 128);
        const high = findExitPortal(world.index, world.blockAt, new Vector3(5, 59, 0), 128);
        expect(low).toEqual(high);
        expect(low?.height).toBe(21);
    });
});

describe('relativePosition and exitPosition', () => {
    const source: PortalRectangle = { minCorner: new Vector3(100, 64, 7), axis: 'x', width: 2, height: 3 };

    it('keeps the fraction of the free width and height, and the offset across the plane', () => {
        // Standing at the right edge of the 2 wide interior: the free width is 1.4, the
        // player's center is 0.3 in from the left when x is 100.3, and 1 of the free width
        // when x is 101.7. Half a block up of the 1.2 free height is 0.5.
        const relative = relativePosition(source, new Vector3(101.7, 64.6, 7.7), PLAYER);
        expect(relative.x).toBeCloseTo(1);
        expect(relative.y).toBeCloseTo(0.5);
        expect(relative.z).toBeCloseTo(0.2);
    });

    it('clamps the fractions into [0, 1] and centers a traveler wider than the portal', () => {
        expect(relativePosition(source, new Vector3(90, 50, 7), PLAYER)).toMatchObject({ x: 0, y: 0 });
        expect(relativePosition(source, new Vector3(100, 64, 7), { width: 3, height: 4 })).toMatchObject({
            x: 0.5,
            y: 0
        });
    });

    it('lands at the same fraction of a wider, taller portal on the other side', () => {
        const relative = relativePosition(source, new Vector3(101.7, 64.6, 7.7), PLAYER);
        const destination: PortalRectangle = { minCorner: new Vector3(10, 70, -3), axis: 'x', width: 4, height: 5 };

        const exit = exitPosition(destination, relative, PLAYER);
        // 0.3 (half the width) plus the whole 3.4 of free width, 0.5 of the 3.2 free height,
        // and the same 0.2 past the plane's center.
        expect(exit.getX()).toBeCloseTo(13.7);
        expect(exit.getY()).toBeCloseTo(71.6);
        expect(exit.getZ()).toBeCloseTo(-2.3);
    });

    it('swaps the along and across offsets for a destination on the other axis', () => {
        const relative = relativePosition(source, new Vector3(100.3, 64, 7.5), PLAYER);
        const destination: PortalRectangle = { minCorner: new Vector3(10, 70, -3), axis: 'z', width: 2, height: 3 };

        const exit = exitPosition(destination, relative, PLAYER);
        expect(exit.getX()).toBeCloseTo(10.5);
        expect(exit.getZ()).toBeCloseTo(-2.7);
    });

    it("turns the yaw a quarter when the axes differ, Java's bipush 90", () => {
        expect(exitYaw(45, 'x', 'x')).toBe(45);
        expect(exitYaw(45, 'x', 'z')).toBe(135);
    });
});
