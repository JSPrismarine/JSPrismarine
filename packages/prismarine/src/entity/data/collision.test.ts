import { describe, expect, it } from 'vitest';

import type { NavigationView } from '@jsprismarine/entity-goals';

import type { BoxBounds, CellSolidity } from './collision';
import { bodyIntersectsMedia, closestOpenFace, hasLineOfSight, sweepAxis } from './collision';

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

/** Cells solid by key, open elsewhere, and not loaded from `unloadedFromX` on. */
const cells =
    (solids: ReadonlySet<string>, unloadedFromX = Number.POSITIVE_INFINITY): CellSolidity =>
    ({ x, y, z }) =>
        x >= unloadedFromX ? undefined : solids.has(`${x},${y},${z}`);

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
});
