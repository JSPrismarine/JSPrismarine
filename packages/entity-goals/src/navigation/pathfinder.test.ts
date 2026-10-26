import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { findPath } from './pathfinder';
import { navigationProfileOf } from './profile';
import { voxelGrid } from './voxelGrid';

/**
 * The path finder against hand-built voxel scenarios.
 *
 * Every layer string runs x to the right and z downward, and layer 0 is the
 * floor the entity stands on, so a walker's feet sit in layer 1.
 */

const steps = (path: { readonly nodes: readonly EntityPosition[] } | undefined): readonly string[] =>
    (path?.nodes ?? []).map((node) => `${node.x},${node.y},${node.z}`);

const walker = navigationProfileOf({ height: 2 });

describe('findPath', () => {
    it('walks a straight line over flat ground', () => {
        const view = voxelGrid([['#####'], ['.....'], ['.....']]);

        const path = findPath(view, walker, { from: { x: 0, y: 1, z: 0 }, to: { x: 4, y: 1, z: 0 } });

        expect(path?.reachedGoal).toBe(true);
        expect(steps(path)).toEqual(['1,1,0', '2,1,0', '3,1,0', '4,1,0']);
    });

    it('returns an empty path when the entity already stands on the goal', () => {
        const view = voxelGrid([['###'], ['...'], ['...']]);

        const path = findPath(view, walker, { from: { x: 1, y: 1, z: 0 }, to: { x: 1, y: 1, z: 0 } });

        expect(path?.reachedGoal).toBe(true);
        expect(path?.nodes).toEqual([]);
    });

    it('goes around a wall', () => {
        const view = voxelGrid([
            ['#####', '#####', '#####'],
            ['..#..', '..#..', '.....'],
            ['..#..', '..#..', '.....']
        ]);

        const path = findPath(view, walker, { from: { x: 0, y: 1, z: 0 }, to: { x: 4, y: 1, z: 0 } });

        expect(path?.reachedGoal).toBe(true);
        expect(steps(path)).not.toContain('2,1,0');
        expect(steps(path)).not.toContain('2,1,1');
        expect(steps(path).at(-1)).toBe('4,1,0');
    });

    it('climbs a staircase one block at a time', () => {
        const view = voxelGrid([['####'], ['.###'], ['..##'], ['...#'], ['....'], ['....']]);

        const path = findPath(view, walker, { from: { x: 0, y: 1, z: 0 }, to: { x: 3, y: 4, z: 0 } });

        expect(path?.reachedGoal).toBe(true);
        expect(steps(path)).toEqual(['1,2,0', '2,3,0', '3,4,0']);
    });

    it('drops down a cliff no further than the fall limit', () => {
        const view = voxelGrid([['##'], ['.#'], ['.#'], ['..']]);
        const request = { from: { x: 1, y: 3, z: 0 }, to: { x: 0, y: 1, z: 0 } };

        const deep = findPath(view, navigationProfileOf({ height: 1 }), request);
        const shallow = findPath(view, navigationProfileOf({ height: 1, maxFallDistance: 1 }), request);

        expect(deep?.reachedGoal).toBe(true);
        expect(steps(deep)).toEqual(['0,1,0']);
        expect(shallow).toBeUndefined();
    });

    it('passes an open door and stops at a closed one', () => {
        const open = voxelGrid([['###'], ['.d.']]);
        const closed = voxelGrid([['###'], ['.D.']]);
        const request = { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } };
        const shortWalker = navigationProfileOf({ height: 1 });

        expect(findPath(open, shortWalker, request)?.reachedGoal).toBe(true);
        expect(findPath(closed, shortWalker, request)).toBeUndefined();
    });

    it('opens a door when the navigation component says it can', () => {
        const view = voxelGrid([['###'], ['.D.']]);
        const opener = navigationProfileOf({ height: 1, canOpenDoors: true });
        const breaker = navigationProfileOf({ height: 1, canBreakDoors: true });

        expect(findPath(view, opener, { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } })?.reachedGoal).toBe(
            true
        );
        expect(findPath(view, breaker, { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } })?.reachedGoal).toBe(
            true
        );
    });

    it('needs can_open_iron_doors for an iron door', () => {
        const view = voxelGrid([['###'], ['.I.']]);
        const request = { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } };

        expect(findPath(view, navigationProfileOf({ height: 1, canOpenDoors: true }), request)).toBeUndefined();
        expect(
            findPath(view, navigationProfileOf({ height: 1, canOpenDoors: true, canOpenIronDoors: true }), request)
                ?.reachedGoal
        ).toBe(true);
    });

    it('finds no path when the goal is walled off', () => {
        const view = voxelGrid([['#####'], ['..#..']]);

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 4, y: 1, z: 0 }
        });

        expect(path).toBeUndefined();
    });

    it('returns the closest node it reached when the caller allows a partial path', () => {
        const view = voxelGrid([['#####'], ['..#..']]);

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 4, y: 1, z: 0 },
            allowPartial: true
        });

        expect(path?.reachedGoal).toBe(false);
        expect(steps(path).at(-1)).toBe('1,1,0');
    });

    it('swims through water only when the profile can', () => {
        const view = voxelGrid([['#####'], ['.~~~.']]);
        const request = { from: { x: 0, y: 1, z: 0 }, to: { x: 4, y: 1, z: 0 } };

        const swimmer = navigationProfileOf({ height: 1, canSwim: true, kind: 'swim' });
        const sinker = navigationProfileOf({ height: 1, avoidWater: true, canFloat: false, canSwim: false });

        expect(findPath(view, swimmer, request)?.reachedGoal).toBe(true);
        expect(findPath(view, sinker, request)).toBeUndefined();
    });

    it('uses Java water malus for a ground path while requiring solid support', () => {
        const submerged = voxelGrid([['#####'], ['.~~~.']]);
        const surface = voxelGrid([['#~#'], ['...']]);
        const javaWalker = navigationProfileOf({
            height: 1,
            canSwim: false,
            canWalk: true,
            pathfindingMalus: { water: 8 }
        });

        expect(
            findPath(submerged, javaWalker, {
                from: { x: 0, y: 1, z: 0 },
                to: { x: 4, y: 1, z: 0 }
            })?.reachedGoal
        ).toBe(true);
        expect(
            findPath(surface, javaWalker, {
                from: { x: 0, y: 1, z: 0 },
                to: { x: 2, y: 1, z: 0 }
            })
        ).toBeUndefined();
    });

    it('does not turn a floating ground navigator into a vertical swimmer', () => {
        const view = voxelGrid([['#'], ['~'], ['~']]);
        const floatingWalker = navigationProfileOf({ height: 1, canFloat: true });

        expect(
            findPath(view, floatingWalker, {
                from: { x: 0, y: 1, z: 0 },
                to: { x: 0, y: 2, z: 0 }
            })
        ).toBeUndefined();
    });

    it('does not treat water as ground support when the profile can path over its surface', () => {
        const view = voxelGrid([['#~#'], ['...']]);

        const path = findPath(view, navigationProfileOf({ height: 1, canPathOverWater: true }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 2, y: 1, z: 0 }
        });

        expect(path).toBeUndefined();
    });

    it('does not treat lava as ground support when the profile can path over its surface', () => {
        const view = voxelGrid([['#!#'], ['...']]);

        const path = findPath(view, navigationProfileOf({ height: 1, canPathOverLava: true }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 2, y: 1, z: 0 }
        });

        expect(path).toBeUndefined();
    });

    it('prefers dry ground when avoid_water is set but water is the only way through', () => {
        const dry = voxelGrid([
            ['###', '###'],
            ['.~.', '...']
        ]);

        const path = findPath(dry, navigationProfileOf({ height: 1, avoidWater: true, canFloat: true }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 2, y: 1, z: 0 }
        });

        expect(steps(path)).not.toContain('1,1,0');
        expect(path?.reachedGoal).toBe(true);
    });

    it('refuses lava unless the profile walks in it', () => {
        const view = voxelGrid([['###'], ['.!.']]);
        const request = { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } };

        expect(findPath(view, navigationProfileOf({ height: 1 }), request)).toBeUndefined();
        expect(findPath(view, navigationProfileOf({ height: 1, canWalkInLava: true }), request)?.reachedGoal).toBe(
            true
        );
    });

    it('refuses a damaging block when avoid_damage_blocks is set', () => {
        const view = voxelGrid([['###'], ['.*.']]);
        const request = { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } };

        expect(findPath(view, navigationProfileOf({ height: 1 }), request)?.reachedGoal).toBe(true);
        expect(findPath(view, navigationProfileOf({ height: 1, avoidDamageBlocks: true }), request)).toBeUndefined();
    });

    it('refuses the blocks the component names in blocks_to_avoid', () => {
        const view = voxelGrid([['###'], ['.L.']]);
        const request = { from: { x: 0, y: 1, z: 0 }, to: { x: 2, y: 1, z: 0 } };

        expect(findPath(view, navigationProfileOf({ height: 1 }), request)?.reachedGoal).toBe(true);
        expect(
            findPath(view, navigationProfileOf({ height: 1, blocksToAvoid: ['minecraft:ladder'] }), request)
        ).toBeUndefined();
    });

    it('flies straight through the air when the profile can fly', () => {
        const view = voxelGrid([['...'], ['...'], ['...']]);

        const path = findPath(view, navigationProfileOf({ height: 1, canFly: true, canWalk: false, kind: 'fly' }), {
            from: { x: 0, y: 0, z: 0 },
            to: { x: 0, y: 2, z: 0 }
        });

        expect(steps(path)).toEqual(['0,1,0', '0,2,0']);
    });

    it('climbs a ladder when the view says the block is climbable', () => {
        const view = voxelGrid([['##'], ['.L'], ['.L'], ['.L']]);

        const path = findPath(view, navigationProfileOf({ height: 1, kind: 'climb' }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 1, y: 3, z: 0 }
        });

        expect(path?.reachedGoal).toBe(true);
        expect(steps(path)).toEqual(['1,1,0', '1,2,0', '1,3,0']);
    });

    it('stops searching at the node budget', () => {
        const row = '.'.repeat(64);
        const view = voxelGrid([['#'.repeat(64)], [row]]);

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 63, y: 1, z: 0 },
            maxNodes: 8
        });

        expect(path).toBeUndefined();
    });

    it('arrives when the goal radius covers the target', () => {
        const view = voxelGrid([['#####'], ['...#.']]);

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 4, y: 1, z: 0 },
            goalRadius: 2
        });

        expect(path?.reachedGoal).toBe(true);
        expect(steps(path).at(-1)).toBe('2,1,0');
    });

    it('gives up on a goal nothing can stand in without expanding the budget', () => {
        const { view, reads } = countingGrid(openFloor(48));

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            // Four blocks up, over an open floor, so the search would otherwise walk the
            // whole floor before admitting the goal is unreachable.
            to: { x: 40, y: 5, z: 40 }
        });

        expect(path).toBeUndefined();
        expect(reads()).toBeLessThan(20);
    });

    it('reads each cell of a search once rather than once per neighbor that borders it', () => {
        const { view, reads } = countingGrid(openFloor(48));

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 1, y: 1, z: 1 },
            to: { x: 46, y: 1, z: 46 }
        });

        expect(path?.reachedGoal).toBe(true);
        // A straight diagonal is the memo's worst case, because the search barely widens and so
        // few cells are asked about twice. It still took 3240 reads before the memo and takes 1145
        // now.
        expect(reads()).toBeLessThan(2_000);
    });

    it('still searches when the goal cell is blocked but the radius covers one that is not', () => {
        const view = voxelGrid([['#####'], ['...##']]);

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 4, y: 1, z: 0 },
            goalRadius: 2
        });

        expect(path?.reachedGoal).toBe(true);
        expect(steps(path).at(-1)).toBe('2,1,0');
    });

    it('still answers a partial request over a goal nothing can stand in', () => {
        const view = voxelGrid([['#####'], ['.....']]);

        const path = findPath(view, navigationProfileOf({ height: 1 }), {
            from: { x: 0, y: 1, z: 0 },
            to: { x: 4, y: 4, z: 0 },
            allowPartial: true
        });

        expect(path?.reachedGoal).toBe(false);
        expect(steps(path).at(-1)).toBe('4,1,0');
    });
});

/** A floor of stone with one layer of air over it, `size` blocks on a side. */
const openFloor = (size: number): readonly (readonly string[])[] => [
    Array.from({ length: size }, () => '#'.repeat(size)),
    Array.from({ length: size }, () => '.'.repeat(size))
];

/** A {@link voxelGrid} that counts how many blocks the search read. */
const countingGrid = (layers: readonly (readonly string[])[]) => {
    const inner = voxelGrid(layers);
    let count = 0;
    const view = Object.fromEntries(
        Object.entries(inner).map(([name, answer]) => [
            name,
            (position: EntityPosition) => {
                count += 1;
                return (answer as (at: EntityPosition) => unknown)(position);
            }
        ])
    ) as unknown as ReturnType<typeof voxelGrid>;
    return { view, reads: () => count };
};
