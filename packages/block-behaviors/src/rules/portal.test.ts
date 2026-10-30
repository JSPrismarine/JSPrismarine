import type { BlockPosition } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { portalFamily } from '../families/world';
import { bindFamily } from '../harness';
import { AIR } from '../identifiers';
import type { VoxelDimension } from '../voxelWorld';
import { createVoxelWorld } from '../voxelWorld';
import { connectedPortalBlocks, findEmptyPortalShape, NETHER_PORTAL, portalInterior, THE_END } from './portal';

const OBSIDIAN = 'minecraft:obsidian';

/** The lowest interior block of the frames the tests build, chosen off the origin. */
const BOTTOM_LEFT: BlockPosition = { x: 10, y: 64, z: -5 };

/** Steps one block along the portal's axis and one block across it. */
const along = (position: BlockPosition, axis: 'x' | 'z', distance: number): BlockPosition =>
    axis === 'x' ? { ...position, x: position.x + distance } : { ...position, z: position.z + distance };

/**
 * Writes an obsidian frame around an interior of `width` by `height` whose
 * bottom-left interior block is `bottomLeft`, leaving the corners out unless asked for.
 */
const buildFrame = (
    world: VoxelDimension,
    bottomLeft: BlockPosition,
    axis: 'x' | 'z',
    width: number,
    height: number,
    options: { corners?: boolean; frame?: string } = {}
): void => {
    const frame = options.frame ?? OBSIDIAN;
    for (let a = -1; a <= width; a += 1) {
        for (let dy = -1; dy <= height; dy += 1) {
            const edgeA = a === -1 || a === width;
            const edgeY = dy === -1 || dy === height;
            if (!edgeA && !edgeY) continue;
            if (edgeA && edgeY && options.corners !== true) continue;
            world.set({ ...along(bottomLeft, axis, a), y: bottomLeft.y + dy }, frame);
        }
    }
};

describe('findEmptyPortalShape', () => {
    it('accepts the smallest frame, 4 by 5 without corners, on both axes', () => {
        for (const axis of ['x', 'z'] as const) {
            const world = createVoxelWorld().overworld;
            buildFrame(world, BOTTOM_LEFT, axis, 2, 3);

            expect(findEmptyPortalShape(world, BOTTOM_LEFT)).toEqual({
                bottomLeft: BOTTOM_LEFT,
                axis,
                width: 2,
                height: 3
            });
        }
    });

    it('accepts the largest frame, 23 by 23', () => {
        const world = createVoxelWorld().overworld;
        buildFrame(world, BOTTOM_LEFT, 'x', 21, 21);

        expect(findEmptyPortalShape(world, { ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 10, y: BOTTOM_LEFT.y + 10 })).toEqual({
            bottomLeft: BOTTOM_LEFT,
            axis: 'x',
            width: 21,
            height: 21
        });
    });

    it('rejects an interior narrower than 2 or wider than 21', () => {
        const narrow = createVoxelWorld().overworld;
        buildFrame(narrow, BOTTOM_LEFT, 'x', 1, 3);
        expect(findEmptyPortalShape(narrow, BOTTOM_LEFT)).toBeUndefined();

        const wide = createVoxelWorld().overworld;
        buildFrame(wide, BOTTOM_LEFT, 'x', 22, 21);
        expect(findEmptyPortalShape(wide, BOTTOM_LEFT)).toBeUndefined();
    });

    it('rejects an interior shorter than 3 or taller than 21', () => {
        const short = createVoxelWorld().overworld;
        buildFrame(short, BOTTOM_LEFT, 'z', 2, 2);
        expect(findEmptyPortalShape(short, BOTTOM_LEFT)).toBeUndefined();

        const tall = createVoxelWorld().overworld;
        buildFrame(tall, BOTTOM_LEFT, 'z', 2, 22);
        expect(findEmptyPortalShape(tall, BOTTOM_LEFT)).toBeUndefined();
    });

    it('rejects a frame with one side block missing', () => {
        const world = createVoxelWorld().overworld;
        buildFrame(world, BOTTOM_LEFT, 'x', 2, 3);
        world.set({ ...BOTTOM_LEFT, x: BOTTOM_LEFT.x - 1, y: BOTTOM_LEFT.y + 1 }, AIR);

        expect(findEmptyPortalShape(world, BOTTOM_LEFT)).toBeUndefined();
    });

    it('rejects a frame with a floor block missing and one with a top block missing', () => {
        const floor = createVoxelWorld().overworld;
        buildFrame(floor, BOTTOM_LEFT, 'x', 2, 3);
        floor.set({ ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 1, y: BOTTOM_LEFT.y - 1 }, AIR);
        expect(findEmptyPortalShape(floor, BOTTOM_LEFT)).toBeUndefined();

        const top = createVoxelWorld().overworld;
        buildFrame(top, BOTTOM_LEFT, 'x', 2, 3);
        top.set({ ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 1, y: BOTTOM_LEFT.y + 3 }, AIR);
        expect(findEmptyPortalShape(top, BOTTOM_LEFT)).toBeUndefined();
    });

    it('does not take crying obsidian for a frame block', () => {
        const world = createVoxelWorld().overworld;
        buildFrame(world, BOTTOM_LEFT, 'x', 2, 3, { frame: 'minecraft:crying_obsidian' });

        expect(findEmptyPortalShape(world, BOTTOM_LEFT)).toBeUndefined();
    });

    it('finds the frame from any interior block, with fire already inside', () => {
        const world = createVoxelWorld().overworld;
        buildFrame(world, BOTTOM_LEFT, 'z', 3, 4);
        world.set({ ...BOTTOM_LEFT, z: BOTTOM_LEFT.z + 1, y: BOTTOM_LEFT.y + 2 }, 'minecraft:fire', { age: 0 });

        const shape = { bottomLeft: BOTTOM_LEFT, axis: 'z', width: 3, height: 4 };
        expect(findEmptyPortalShape(world, { ...BOTTOM_LEFT, z: BOTTOM_LEFT.z + 2, y: BOTTOM_LEFT.y + 3 })).toEqual(
            shape
        );
        expect(findEmptyPortalShape(world, { ...BOTTOM_LEFT, z: BOTTOM_LEFT.z + 1, y: BOTTOM_LEFT.y + 2 })).toEqual(
            shape
        );
    });

    it('refuses a frame that already holds portal blocks', () => {
        const world = createVoxelWorld().overworld;
        buildFrame(world, BOTTOM_LEFT, 'x', 2, 3);
        world.set(BOTTOM_LEFT, NETHER_PORTAL, { portal_axis: 'x' });

        expect(findEmptyPortalShape(world, { ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 1 })).toBeUndefined();
    });

    it('rejects a frame with a solid block inside', () => {
        const world = createVoxelWorld().overworld;
        buildFrame(world, BOTTOM_LEFT, 'x', 2, 3);
        world.set({ ...BOTTOM_LEFT, y: BOTTOM_LEFT.y + 1 }, 'minecraft:stone');

        expect(findEmptyPortalShape(world, BOTTOM_LEFT)).toBeUndefined();
    });
});

describe('portalInterior', () => {
    it('lists every interior block, column by column from the bottom left', () => {
        expect(portalInterior({ bottomLeft: { x: 0, y: 10, z: 0 }, axis: 'z', width: 2, height: 3 })).toEqual([
            { x: 0, y: 10, z: 0 },
            { x: 0, y: 11, z: 0 },
            { x: 0, y: 12, z: 0 },
            { x: 0, y: 10, z: 1 },
            { x: 0, y: 11, z: 1 },
            { x: 0, y: 12, z: 1 }
        ]);
    });
});

describe('portalFamily lighting', () => {
    const fireAt = (world: VoxelDimension, position: BlockPosition): void => {
        world.set(position, 'minecraft:fire', { age: 0 });
    };

    it('fills the frame with portal blocks on the x axis when fire appears inside', () => {
        const harness = bindFamily(portalFamily, 'minecraft:fire');
        buildFrame(harness.dimension, BOTTOM_LEFT, 'x', 2, 3);
        const fire = { ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 1, y: BOTTOM_LEFT.y + 2 };
        fireAt(harness.dimension, fire);

        harness.place(fire);

        for (const position of portalInterior({ bottomLeft: BOTTOM_LEFT, axis: 'x', width: 2, height: 3 })) {
            expect(harness.dimension.identifierAt(position)).toBe(NETHER_PORTAL);
            expect(harness.dimension.stateAt(position, 'portal_axis')).toBe('x');
        }
    });

    it('writes the z axis for a frame running north to south, from soul fire too', () => {
        const harness = bindFamily(portalFamily, 'minecraft:soul_fire');
        buildFrame(harness.dimension, BOTTOM_LEFT, 'z', 2, 3);
        harness.dimension.set(BOTTOM_LEFT, 'minecraft:soul_fire', { age: 0 });

        harness.place(BOTTOM_LEFT);

        expect(harness.dimension.identifierAt(BOTTOM_LEFT)).toBe(NETHER_PORTAL);
        expect(harness.dimension.stateAt(BOTTOM_LEFT, 'portal_axis')).toBe('z');
        expect(harness.dimension.identifierAt({ ...BOTTOM_LEFT, z: BOTTOM_LEFT.z + 1, y: BOTTOM_LEFT.y + 2 })).toBe(
            NETHER_PORTAL
        );
    });

    it('leaves fire alone outside a complete frame', () => {
        const harness = bindFamily(portalFamily, 'minecraft:fire');
        buildFrame(harness.dimension, BOTTOM_LEFT, 'x', 2, 3);
        harness.dimension.set({ ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 2, y: BOTTOM_LEFT.y + 1 }, AIR);
        fireAt(harness.dimension, BOTTOM_LEFT);

        harness.place(BOTTOM_LEFT);

        expect(harness.dimension.identifierAt(BOTTOM_LEFT)).toBe('minecraft:fire');
    });

    it('lights nothing in the End', () => {
        const harness = bindFamily(portalFamily, 'minecraft:fire', { dimension: THE_END });
        buildFrame(harness.dimension, BOTTOM_LEFT, 'x', 2, 3);
        fireAt(harness.dimension, BOTTOM_LEFT);

        harness.place(BOTTOM_LEFT);

        expect(harness.dimension.identifierAt(BOTTOM_LEFT)).toBe('minecraft:fire');
    });
});

describe('portalFamily collapse', () => {
    const litFrame = (axis: 'x' | 'z', width = 2, height = 3) => {
        const harness = bindFamily(portalFamily, NETHER_PORTAL);
        buildFrame(harness.dimension, BOTTOM_LEFT, axis, width, height);
        const frame = { bottomLeft: BOTTOM_LEFT, axis, width, height };
        for (const position of portalInterior(frame)) {
            harness.dimension.set(position, NETHER_PORTAL, { portal_axis: axis });
        }
        return { harness, frame };
    };

    it('lists every portal block connected to one through the portal plane', () => {
        const { harness, frame } = litFrame('x', 3, 4);

        const connected = connectedPortalBlocks(harness.dimension, {
            ...BOTTOM_LEFT,
            x: BOTTOM_LEFT.x + 1,
            y: BOTTOM_LEFT.y + 2
        });

        expect(connected).toHaveLength(12);
        expect(new Set(connected.map((position) => `${position.x},${position.y},${position.z}`))).toEqual(
            new Set(portalInterior(frame).map((position) => `${position.x},${position.y},${position.z}`))
        );
    });

    it('clears the whole interior when one frame block beside it goes', () => {
        const { harness, frame } = litFrame('x');
        const brokenFrame = { ...BOTTOM_LEFT, x: BOTTOM_LEFT.x - 1, y: BOTTOM_LEFT.y + 1 };
        harness.dimension.set(brokenFrame, AIR);

        harness.neighborChanged({ ...BOTTOM_LEFT, y: BOTTOM_LEFT.y + 1 }, 'west');

        for (const position of portalInterior(frame)) {
            expect(harness.dimension.identifierAt(position)).toBe(AIR);
        }
    });

    it('clears the interior when the frame block above or below goes', () => {
        const { harness, frame } = litFrame('z');
        harness.dimension.set({ ...BOTTOM_LEFT, y: BOTTOM_LEFT.y - 1 }, AIR);

        harness.neighborChanged(BOTTOM_LEFT, 'down');

        for (const position of portalInterior(frame)) {
            expect(harness.dimension.identifierAt(position)).toBe(AIR);
        }
    });

    it('ignores a change on the face across the portal plane', () => {
        const { harness, frame } = litFrame('x');
        harness.dimension.set({ ...BOTTOM_LEFT, z: BOTTOM_LEFT.z + 1 }, 'minecraft:stone');

        harness.neighborChanged(BOTTOM_LEFT, 'south');
        harness.neighborChanged(BOTTOM_LEFT, 'north');

        for (const position of portalInterior(frame)) {
            expect(harness.dimension.identifierAt(position)).toBe(NETHER_PORTAL);
        }
    });

    it('stays lit while the neighbor on its axis is another portal block or a frame block', () => {
        const { harness, frame } = litFrame('x');

        harness.neighborChanged(BOTTOM_LEFT, 'east');
        harness.neighborChanged(BOTTOM_LEFT, 'west');
        harness.neighborChanged(BOTTOM_LEFT, 'up');

        for (const position of portalInterior(frame)) {
            expect(harness.dimension.identifierAt(position)).toBe(NETHER_PORTAL);
        }
    });
});
