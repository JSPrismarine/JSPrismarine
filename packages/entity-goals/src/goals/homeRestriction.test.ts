import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import { breaksHomeRestriction } from '../navigator';
import type { GoalWorld } from '../world';

/** A flat square of stone with three layers of air over it. */
const flatWorld = (size: number): GoalWorld => {
    const floor = Array.from({ length: size }, () => '#'.repeat(size));
    const air = Array.from({ length: size }, () => '.'.repeat(size));
    const view = voxelGrid([floor, air, air, air]);
    return { navigation: () => view };
};

const walker = { 'minecraft:collision_box': { width: 0.6, height: 1.8 }, 'minecraft:navigation.walk': {} };

const HOME: EntityPosition = { x: 20.5, y: 1, z: 20.5 };

/** Every destination a stroller picks over many strolls, with its home where it spawned. */
const strollDestinations = (home: Record<string, unknown> | undefined): readonly EntityPosition[] => {
    const harness = new GoalHarness({
        goals: { 'minecraft:behavior.random_stroll': { priority: 6, interval: 0, xz_dist: 10, y_dist: 1 } },
        components: { ...walker, ...(home === undefined ? {} : { 'minecraft:home': home }) },
        world: flatWorld(41),
        at: HOME
    });
    for (let tick = 0; tick < 400; tick += 1) harness.tick();
    return harness.actuator.log.flatMap((entry) => {
        const match = entry.match(/^moveTo (\S+),(\S+),(\S+) @/);
        return match === null ? [] : [{ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }];
    });
};

const blocksFromHome = (position: EntityPosition): number =>
    Math.hypot(Math.floor(position.x) - Math.floor(HOME.x), Math.floor(position.z) - Math.floor(HOME.z));

describe('minecraft:home restriction', () => {
    it("keeps a stroller's destinations inside its restriction radius, as Java's RandomPos does", () => {
        const destinations = strollDestinations({ restriction_radius: 4, restriction_type: 'random_movement' });

        expect(destinations.length).toBeGreaterThan(5);
        expect(Math.max(...destinations.map(blocksFromHome))).toBeLessThan(4);
    });

    it('lets a stroller with no restriction type wander its whole range', () => {
        const destinations = strollDestinations({ restriction_radius: 4 });

        expect(Math.max(...destinations.map(blocksFromHome))).toBeGreaterThanOrEqual(4);
    });

    it('frees an entity that strayed past the radius plus its range, as GoalUtils.mobRestricted does', () => {
        const home = { center: HOME, radius: 4 };
        const outside = { x: HOME.x + 8, y: HOME.y, z: HOME.z };

        expect(breaksHomeRestriction(home, HOME, 10, outside)).toBe(true);
        expect(breaksHomeRestriction(home, { x: HOME.x + 14, y: HOME.y, z: HOME.z }, 10, outside)).toBe(true);
        expect(breaksHomeRestriction(home, { x: HOME.x + 15, y: HOME.y, z: HOME.z }, 10, outside)).toBe(false);
    });
});
