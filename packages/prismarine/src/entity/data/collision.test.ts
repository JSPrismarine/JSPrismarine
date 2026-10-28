import { describe, expect, it } from 'vitest';

import type { NavigationView } from '@jsprismarine/entity-goals';

import { bodyIntersectsMedia, hasLineOfSight } from './collision';

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
