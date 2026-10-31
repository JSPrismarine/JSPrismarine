import type { BlockPosition } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { portalFamily } from '../families/world';
import { bindFamily, heldItem } from '../harness';
import { AIR } from '../identifiers';
import type { VoxelDimension } from '../voxelWorld';
import { createVoxelWorld } from '../voxelWorld';
import {
    connectedPortalBlocks,
    END_PORTAL,
    findEmptyPortalShape,
    findEndPortalRing,
    NETHER_PORTAL,
    piglinSpawnRoll,
    portalCreationSite,
    portalInterior,
    THE_END,
    writeEndPlatform,
    writeNetherPortal
} from './portal';

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

describe('end portal ring', () => {
    const CENTER: BlockPosition = { x: 100, y: 60, z: 200 };
    const FRAME = 'minecraft:end_portal_frame';

    /** The twelve frames around a 3 by 3 center, every one holding an eye and facing the center. */
    const ringFrames = (center: BlockPosition): { position: BlockPosition; facing: string }[] => {
        const frames: { position: BlockPosition; facing: string }[] = [];
        for (let k = -1; k <= 1; k += 1) {
            frames.push({ position: { ...center, x: center.x + k, z: center.z - 2 }, facing: 'south' });
            frames.push({ position: { ...center, x: center.x + k, z: center.z + 2 }, facing: 'north' });
            frames.push({ position: { ...center, x: center.x - 2, z: center.z + k }, facing: 'east' });
            frames.push({ position: { ...center, x: center.x + 2, z: center.z + k }, facing: 'west' });
        }
        return frames;
    };

    const buildRing = (world: VoxelDimension, center: BlockPosition, eyes = true): void => {
        for (const frame of ringFrames(center)) {
            world.set(frame.position, FRAME, {
                end_portal_eye_bit: eyes ? 1 : 0,
                'minecraft:cardinal_direction': frame.facing
            });
        }
    };

    it('finds the center from any of the twelve frames', () => {
        const world = createVoxelWorld().overworld;
        buildRing(world, CENTER);

        for (const frame of ringFrames(CENTER)) {
            expect(findEndPortalRing(world, frame.position)).toEqual(CENTER);
        }
    });

    it('does not match while one frame is missing its eye', () => {
        const world = createVoxelWorld().overworld;
        buildRing(world, CENTER);
        world.set({ ...CENTER, x: CENTER.x + 2, z: CENTER.z + 1 }, FRAME, {
            end_portal_eye_bit: 0,
            'minecraft:cardinal_direction': 'west'
        });

        expect(findEndPortalRing(world, { ...CENTER, x: CENTER.x - 2, z: CENTER.z })).toBeUndefined();
    });

    it('does not match while one frame faces away from the center', () => {
        const world = createVoxelWorld().overworld;
        buildRing(world, CENTER);
        world.set({ ...CENTER, x: CENTER.x, z: CENTER.z - 2 }, FRAME, {
            end_portal_eye_bit: 1,
            'minecraft:cardinal_direction': 'north'
        });

        expect(findEndPortalRing(world, { ...CENTER, x: CENTER.x - 2, z: CENTER.z })).toBeUndefined();
    });

    it('does not match a frame that is not part of any ring', () => {
        const world = createVoxelWorld().overworld;
        world.set(CENTER, FRAME, { end_portal_eye_bit: 1, 'minecraft:cardinal_direction': 'south' });

        expect(findEndPortalRing(world, CENTER)).toBeUndefined();
    });

    it('fills the 3 by 3 with end portal when the last eye goes in', () => {
        const harness = bindFamily(portalFamily, FRAME);
        buildRing(harness.dimension, CENTER);
        const last = { ...CENTER, x: CENTER.x + 1, z: CENTER.z + 2 };
        harness.dimension.set(last, FRAME, { end_portal_eye_bit: 0, 'minecraft:cardinal_direction': 'north' });

        expect(harness.interact(last, { itemStack: heldItem('minecraft:ender_eye') })).toMatchObject({
            consumed: true
        });

        let written = 0;
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dz = -1; dz <= 1; dz += 1) {
                if (harness.dimension.identifierAt({ ...CENTER, x: CENTER.x + dx, z: CENTER.z + dz }) === END_PORTAL) {
                    written += 1;
                }
            }
        }
        expect(written).toBe(9);
        expect(harness.dimension.sounds.map((sound) => sound.name)).toContain('block.end_portal.spawn');
    });

    it('leaves the center alone when the ring is still incomplete after the eye', () => {
        const harness = bindFamily(portalFamily, FRAME);
        buildRing(harness.dimension, CENTER, false);
        const first = { ...CENTER, x: CENTER.x - 2, z: CENTER.z };

        expect(harness.interact(first, { itemStack: heldItem('minecraft:ender_eye') })).toMatchObject({
            consumed: true
        });

        expect(harness.dimension.identifierAt(CENTER)).toBe(AIR);
        expect(harness.dimension.stateAt(first, 'end_portal_eye_bit')).toBe(true);
    });
});

describe('portalCreationSite', () => {
    const NETHER_BOUNDS = { minY: 0, maxY: 128 };
    const TARGET: BlockPosition = { x: 40, y: 64, z: 40 };

    /** A solid shelf of `depth` rows across the axis, four blocks along it, with its top at `y - 1`. */
    const shelf = (world: VoxelDimension, at: BlockPosition, axis: 'x' | 'z', depth: 1 | 3): void => {
        for (let a = -1; a <= 2; a += 1) {
            for (let across = depth === 3 ? -1 : 0; across <= (depth === 3 ? 1 : 0); across += 1) {
                const alongAxis = along(at, axis, a);
                const position =
                    axis === 'x'
                        ? { ...alongAxis, z: alongAxis.z + across }
                        : { ...alongAxis, x: alongAxis.x + across };
                world.set({ ...position, y: at.y - 1 }, 'minecraft:netherrack');
            }
        }
    };

    it('takes a shelf three deep with air above it, which is the first pass', () => {
        const world = createVoxelWorld().overworld;
        const ledge = { x: 45, y: 70, z: 38 };
        shelf(world, ledge, 'x', 3);

        expect(portalCreationSite(world, TARGET, 'x', NETHER_BOUNDS)).toEqual({ at: ledge, forced: false });
    });

    it('prefers the closer of two valid shelves', () => {
        const world = createVoxelWorld().overworld;
        const near = { x: 44, y: 66, z: 40 };
        const far = { x: 30, y: 60, z: 50 };
        shelf(world, near, 'z', 3);
        shelf(world, far, 'z', 3);

        expect(portalCreationSite(world, TARGET, 'z', NETHER_BOUNDS)).toEqual({ at: near, forced: false });
    });

    it('falls back to a shelf one deep when nothing three deep exists, which is the second pass', () => {
        const world = createVoxelWorld().overworld;
        const ledge = { x: 36, y: 60, z: 44 };
        shelf(world, ledge, 'x', 1);

        expect(portalCreationSite(world, TARGET, 'x', NETHER_BOUNDS)).toEqual({ at: ledge, forced: false });
    });

    it('ignores a shelf outside the 16 block search radius', () => {
        const world = createVoxelWorld().overworld;
        shelf(world, { x: 40 + 18, y: 64, z: 40 }, 'x', 3);

        expect(portalCreationSite(world, TARGET, 'x', NETHER_BOUNDS).forced).toBe(true);
    });

    it('forces a portal one block back along the axis when nothing fits, clamping y to 70 and maxY - 10', () => {
        const world = createVoxelWorld().overworld;

        expect(portalCreationSite(world, { x: 40, y: 20, z: 40 }, 'x', NETHER_BOUNDS)).toEqual({
            at: { x: 39, y: 70, z: 40 },
            forced: true
        });
        expect(portalCreationSite(world, { x: 40, y: 125, z: 40 }, 'z', NETHER_BOUNDS)).toEqual({
            at: { x: 40, y: 118, z: 39 },
            forced: true
        });
        expect(portalCreationSite(world, { x: 40, y: 300, z: 40 }, 'x', { minY: -64, maxY: 320 })).toEqual({
            at: { x: 39, y: 300, z: 40 },
            forced: true
        });
    });
});

describe('writeNetherPortal', () => {
    const SITE: BlockPosition = { x: 0, y: 80, z: 0 };

    const count = (
        world: VoxelDimension,
        identifier: string,
        box: { from: BlockPosition; to: BlockPosition }
    ): number => {
        let total = 0;
        for (let x = box.from.x; x <= box.to.x; x += 1) {
            for (let y = box.from.y; y <= box.to.y; y += 1) {
                for (let z = box.from.z; z <= box.to.z; z += 1) {
                    if (world.identifierAt({ x, y, z }) === identifier) total += 1;
                }
            }
        }
        return total;
    };

    it('writes a 4 by 5 obsidian frame with corners and six portal blocks on the axis', () => {
        const world = createVoxelWorld().overworld;

        writeNetherPortal(world, SITE, 'x', false);

        const box = { from: { x: -1, y: 79, z: 0 }, to: { x: 2, y: 83, z: 0 } };
        expect(count(world, OBSIDIAN, box)).toBe(14);
        expect(count(world, NETHER_PORTAL, box)).toBe(6);
        for (const position of portalInterior({ bottomLeft: SITE, axis: 'x', width: 2, height: 3 })) {
            expect(world.stateAt(position, 'portal_axis')).toBe('x');
        }
        expect(findEmptyPortalShape(world, SITE)).toBeUndefined();
        expect(connectedPortalBlocks(world, SITE)).toHaveLength(6);
    });

    it('adds the floating platform with netherrack flanks when the site was forced', () => {
        const world = createVoxelWorld().overworld;
        world.fill({ x: -3, y: 79, z: -3 }, { x: 4, y: 83, z: 3 }, 'minecraft:stone');

        writeNetherPortal(world, SITE, 'z', true);

        // Obsidian under the two interior columns and one block to each side of the plane.
        for (let dz = 0; dz <= 1; dz += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                expect(world.identifierAt({ x: dx, y: 79, z: dz })).toBe(OBSIDIAN);
            }
        }
        // Four netherrack on each side of the obsidian, along the whole frame.
        for (let dz = -1; dz <= 2; dz += 1) {
            expect(world.identifierAt({ x: -2, y: 79, z: dz })).toBe('minecraft:netherrack');
            expect(world.identifierAt({ x: 2, y: 79, z: dz })).toBe('minecraft:netherrack');
        }
        // Room to stand on both sides of the portal.
        for (let dz = 0; dz <= 1; dz += 1) {
            for (let dy = 0; dy <= 2; dy += 1) {
                expect(world.identifierAt({ x: -1, y: 80 + dy, z: dz })).toBe(AIR);
                expect(world.identifierAt({ x: 1, y: 80 + dy, z: dz })).toBe(AIR);
            }
        }
        expect(world.identifierAt({ x: 0, y: 81, z: 0 })).toBe(NETHER_PORTAL);
        expect(world.stateAt({ x: 0, y: 81, z: 0 }, 'portal_axis')).toBe('z');
    });
});

describe('writeEndPlatform', () => {
    it('writes 5 by 5 obsidian under the center and clears three blocks of air above it', () => {
        const world = createVoxelWorld().overworld;
        const center = { x: 100, y: 49, z: 0 };
        world.fill({ x: 97, y: 47, z: -3 }, { x: 103, y: 52, z: 3 }, 'minecraft:end_stone');

        writeEndPlatform(world, center);

        for (let dx = -2; dx <= 2; dx += 1) {
            for (let dz = -2; dz <= 2; dz += 1) {
                expect(world.identifierAt({ x: 100 + dx, y: 48, z: dz })).toBe(OBSIDIAN);
                for (let dy = 0; dy <= 2; dy += 1) {
                    expect(world.identifierAt({ x: 100 + dx, y: 49 + dy, z: dz })).toBe(AIR);
                }
            }
        }
        expect(world.identifierAt({ x: 97, y: 48, z: 0 })).toBe('minecraft:end_stone');
        expect(world.identifierAt({ x: 100, y: 47, z: 0 })).toBe('minecraft:end_stone');
        expect(world.identifierAt({ x: 100, y: 52, z: 0 })).toBe('minecraft:end_stone');
    });
});

describe('piglinSpawnRoll', () => {
    it('is one, two and three chances in two thousand for easy, normal and hard', () => {
        expect(piglinSpawnRoll(() => 0.0004, 1)).toBe(true);
        expect(piglinSpawnRoll(() => 0.0006, 1)).toBe(false);
        expect(piglinSpawnRoll(() => 0.0009, 2)).toBe(true);
        expect(piglinSpawnRoll(() => 0.0012, 2)).toBe(false);
        expect(piglinSpawnRoll(() => 0.0014, 3)).toBe(true);
        expect(piglinSpawnRoll(() => 0.0015, 3)).toBe(false);
    });

    it('never spawns on peaceful', () => {
        expect(piglinSpawnRoll(() => 0, 0)).toBe(false);
    });
});

describe('portalFamily random tick', () => {
    const litPortal = (dimension?: string) => {
        const harness = bindFamily(portalFamily, NETHER_PORTAL, { dimension });
        buildFrame(harness.dimension, BOTTOM_LEFT, 'x', 2, 3);
        const frame = { bottomLeft: BOTTOM_LEFT, axis: 'x' as const, width: 2, height: 3 };
        for (const position of portalInterior(frame)) {
            harness.dimension.set(position, NETHER_PORTAL, { portal_axis: 'x' });
        }
        return harness;
    };

    it('spawns a zombified piglin beside the bottom of the portal when the roll succeeds', () => {
        const harness = litPortal();
        harness.dimension.queueRandom(0.0001);

        harness.randomTick({ ...BOTTOM_LEFT, y: BOTTOM_LEFT.y + 2 });

        expect(harness.dimension.entities.map((entity) => [entity.identifier, entity.position])).toEqual([
            ['minecraft:zombie_pigman', { ...BOTTOM_LEFT, z: BOTTOM_LEFT.z + 1 }]
        ]);
    });

    it('spawns east of a portal running north to south', () => {
        const harness = bindFamily(portalFamily, NETHER_PORTAL);
        buildFrame(harness.dimension, BOTTOM_LEFT, 'z', 2, 3);
        harness.dimension.set(BOTTOM_LEFT, NETHER_PORTAL, { portal_axis: 'z' });
        harness.dimension.queueRandom(0.0001);

        harness.randomTick(BOTTOM_LEFT);

        expect(harness.dimension.entities[0]?.position).toEqual({ ...BOTTOM_LEFT, x: BOTTOM_LEFT.x + 1 });
    });

    it('spawns nothing when the roll fails', () => {
        const harness = litPortal();
        harness.dimension.queueRandom(0.5);

        harness.randomTick(BOTTOM_LEFT);

        expect(harness.dimension.entities).toEqual([]);
    });

    it('spawns nothing outside the Overworld', () => {
        const harness = litPortal('minecraft:nether');
        harness.dimension.queueRandom(0.0001);

        harness.randomTick(BOTTOM_LEFT);

        expect(harness.dimension.entities).toEqual([]);
    });
});
