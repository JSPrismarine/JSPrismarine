import { describe, expect, it } from 'vitest';

import type { NavigationView } from '@jsprismarine/entity-goals';

import type { BedrockCollisionBox } from '@jsprismarine/blocks';
import { FULL_CUBE_SHAPE } from '@jsprismarine/blocks';

import type { BodyBlocks, BoxBounds, CellShape } from './collision';
import {
    bodyCanOccupy,
    bodyIntersectsMedia,
    closestOpenFace,
    hasLineOfSight,
    isSupported,
    landingY,
    sweepAxis
} from './collision';

const navigationWithSolids = (solids: ReadonlySet<string>): NavigationView => ({
    blockAt: () => undefined,
    isPassable: () => true,
    isSolid: ({ x, y, z }) => solids.has(`${x},${y},${z}`),
    isWater: () => false,
    isLava: () => false
});

describe('hasLineOfSight', () => {
    it('sees across clear cells and stops at an intervening solid block', () => {
        const from = { x: 0.5, y: 2.5, z: 0.5 };
        const to = { x: 3.5, y: 2.5, z: 0.5 };

        expect(hasLineOfSight(from, to, navigationWithSolids(new Set()))).toBe(true);
        expect(hasLineOfSight(from, to, navigationWithSolids(new Set(['2,2,0'])))).toBe(false);
    });

    it("doesn't let the target's own block occlude the view", () => {
        expect(
            hasLineOfSight(
                { x: 0.5, y: 2.5, z: 0.5 },
                { x: 3.5, y: 2.5, z: 0.5 },
                navigationWithSolids(new Set(['3,2,0']))
            )
        ).toBe(true);
    });
});

describe('bodyIntersectsMedia', () => {
    it('finds water and lava before ending the shared scan', () => {
        const waterVisits: string[] = [];
        const lavaVisits: string[] = [];

        const media = bodyIntersectsMedia(
            { x: 1.5, y: 0, z: 0.5 },
            { width: 3, height: 1 },
            ({ x, y, z }) => {
                waterVisits.push(`${x},${y},${z}`);
                return x === 0 && y === 0 && z === -1;
            },
            ({ x, y, z }) => {
                lavaVisits.push(`${x},${y},${z}`);
                return x === 0 && y === 0 && z === 0;
            }
        );

        expect(media).toEqual([true, true]);
        expect(waterVisits).toEqual(['0,0,-1']);
        expect(lavaVisits).toEqual(['0,0,-1', '0,0,0']);
    });

    it('keeps searching for the missing medium after finding the other', () => {
        const waterVisits: string[] = [];
        const lavaVisits: string[] = [];

        const media = bodyIntersectsMedia(
            { x: 1.5, y: 0, z: 0.5 },
            { width: 3, height: 1 },
            ({ x, y, z }) => {
                waterVisits.push(`${x},${y},${z}`);
                return x === 0 && y === 0 && z === -1;
            },
            ({ x, y, z }) => {
                lavaVisits.push(`${x},${y},${z}`);
                return false;
            }
        );

        expect(media).toEqual([true, false]);
        expect(waterVisits).toEqual(['0,0,-1']);
        expect(lavaVisits).toHaveLength(9);
    });
});

/** Full cubes by key, open elsewhere, and not loaded from `unloadedFromX` on. */
const cells =
    (solids: ReadonlySet<string>, unloadedFromX = Number.POSITIVE_INFINITY): CellShape =>
    ({ x, y, z }) =>
        x >= unloadedFromX ? undefined : solids.has(`${x},${y},${z}`) ? FULL_CUBE_SHAPE : [];

const SLAB: readonly BedrockCollisionBox[] = [[0, 0, 0, 1, 0.5, 1]];
const CARPET: readonly BedrockCollisionBox[] = [[0, 0, 0, 1, 0.0625, 1]];
const FENCE_POST: readonly BedrockCollisionBox[] = [[0.375, 0, 0.375, 0.625, 1.5, 0.625]];

/** One shaped block at the origin cell, open cells everywhere else. */
const oneBlock =
    (shape: readonly BedrockCollisionBox[]): CellShape =>
    ({ x, y, z }) =>
        x === 0 && y === 0 && z === 0 ? shape : [];

/** A quarter-block box like a dropped item's, its lowest corner at a point. */
const quarterBox = (x: number, y: number, z: number): BoxBounds => ({
    min: { x, y, z },
    max: { x: x + 0.25, y: y + 0.25, z: z + 0.25 }
});

describe('sweepAxis', () => {
    it('moves the whole way through open cells', () => {
        expect(sweepAxis(quarterBox(0.5, 0.5, 0.5), 'x', 0.1, cells(new Set()))).toBeCloseTo(0.6, 9);
    });

    it('stops flush against the first solid layer the box enters, in either direction', () => {
        const solid = cells(new Set(['1,0,0', '0,3,0', '0,-1,0']));

        expect(sweepAxis(quarterBox(0.5, 0.5, 0.5), 'x', 0.6, solid)).toBe(0.75);
        expect(sweepAxis(quarterBox(0.5, 0.5, 0.5), 'y', 4, solid)).toBe(2.75);
        expect(sweepAxis(quarterBox(0.5, 0.5, 0.5), 'y', -3, solid)).toBe(0);
    });

    it('counts a layer the box only overlaps at its edge', () => {
        // The box spans z 0.9 to 1.15, so the wall at z = 1 one cell over stops it.
        expect(sweepAxis(quarterBox(0.5, 0.5, 0.9), 'x', 0.6, cells(new Set(['1,0,1'])))).toBe(0.75);
    });

    it('does not move a box resting against a face into it', () => {
        expect(sweepAxis(quarterBox(0.75, 0.5, 0.5), 'x', 0.1, cells(new Set(['1,0,0'])))).toBe(0.75);
    });

    it('is undefined when the move would cross a cell that is not loaded', () => {
        expect(sweepAxis(quarterBox(0.5, 0.5, 0.5), 'x', 0.6, cells(new Set(), 1))).toBe(undefined);
    });
});

describe('sweepAxis against partial shapes', () => {
    it('lands a falling box on the real top of a slab, a carpet and a fence post', () => {
        const above = quarterBox(0.4, 3, 0.4);

        expect(sweepAxis(above, 'y', -5, oneBlock(SLAB))).toBe(0.5);
        expect(sweepAxis(above, 'y', -5, oneBlock(CARPET))).toBe(0.0625);
        expect(sweepAxis(above, 'y', -5, oneBlock(FENCE_POST))).toBe(1.5);
    });

    it('lets a box beside a fence post fall past it to the ground', () => {
        expect(sweepAxis(quarterBox(0.7, 3, 0.7), 'y', -3.5, oneBlock(FENCE_POST))).toBe(-0.5);
    });

    it('stops a box moving sideways at the part of a fence post that reaches into the cell above', () => {
        expect(sweepAxis(quarterBox(-0.5, 1.1, 0.4), 'x', 1, oneBlock(FENCE_POST))).toBe(0.125);
    });

    it('lets a box above a slab slide across it', () => {
        expect(sweepAxis(quarterBox(-0.5, 0.5, 0.4), 'x', 1, oneBlock(SLAB))).toBe(0.5);
    });
});

/** A body's block reads over one shaped block at the origin cell. */
const bodyBlocks = (shape: readonly BedrockCollisionBox[]): BodyBlocks => ({
    collisionAt: oneBlock(shape),
    blockAt: () => undefined
});

describe('mob bodies against partial shapes', () => {
    const box = { width: 0.6, height: 1.8 };

    it('stands a body on a slab half a block up and on a carpet a sixteenth up', () => {
        expect(isSupported({ x: 0.5, y: 0.5, z: 0.5 }, box, bodyBlocks(SLAB))).toBe(true);
        expect(isSupported({ x: 0.5, y: 1, z: 0.5 }, box, bodyBlocks(SLAB))).toBe(false);
        expect(isSupported({ x: 0.5, y: 0.0625, z: 0.5 }, box, bodyBlocks(CARPET))).toBe(true);
    });

    it('fits a body on top of a slab but not sunk into it', () => {
        expect(bodyCanOccupy({ x: 0.5, y: 0.5, z: 0.5 }, box, bodyBlocks(SLAB))).toBe(true);
        expect(bodyCanOccupy({ x: 0.5, y: 0.25, z: 0.5 }, box, bodyBlocks(SLAB))).toBe(false);
    });

    it('finds where a falling body lands on a fence post', () => {
        expect(landingY({ x: 0.5, y: 2, z: 0.5 }, box, bodyBlocks(FENCE_POST), 1)).toBe(1.5);
    });
});

describe('closestOpenFace', () => {
    it('picks the nearest face that opens onto a cell that is not solid', () => {
        expect(closestOpenFace({ x: 0.9, y: 0.5, z: 0.5 }, cells(new Set()))).toEqual({ axis: 'x', step: 1 });
        expect(closestOpenFace({ x: 0.9, y: 0.5, z: 0.4 }, cells(new Set(['1,0,0'])))).toEqual({
            axis: 'z',
            step: -1
        });
    });

    it('goes up when every side is closed, and never down', () => {
        const walls = cells(new Set(['1,0,0', '-1,0,0', '0,0,1', '0,0,-1', '0,1,0']));

        expect(closestOpenFace({ x: 0.5, y: 0.1, z: 0.5 }, walls)).toEqual({ axis: 'y', step: 1 });
    });

    it('is undefined when a neighbor is not loaded', () => {
        expect(closestOpenFace({ x: 0.9, y: 0.5, z: 0.5 }, cells(new Set(), 1))).toBe(undefined);
    });

    it('takes a face onto a partial block as open, as Java asks only whether the shape is a full cube', () => {
        const slabEast: CellShape = ({ x, y, z }) => (x === 1 && y === 0 && z === 0 ? SLAB : []);

        expect(closestOpenFace({ x: 0.9, y: 0.5, z: 0.5 }, slabEast)).toEqual({ axis: 'x', step: 1 });
    });
});
