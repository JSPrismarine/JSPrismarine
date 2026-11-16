import type { EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';
import type { GoalMob, GoalWorld, SchoolMembership } from '../world';

/** One fish of a test school: its harness, the school membership its world keeps, and its type. */
interface Fish {
    readonly harness: GoalHarness;
    readonly school: SchoolMembership;
    readonly identifier: string;
}

/**
 * Spawns fish at the given spots, each seeing the others through `mobs` the way a server's world
 * shows them, and each with a random swim so a follower's standing down can be watched.
 */
const pond = (
    spots: readonly EntityPosition[],
    identifiers: string | readonly string[] = 'minecraft:cod',
    maxSchool = 8
): Fish[] => {
    const fish: Fish[] = [];
    const mobOf = (other: Fish): GoalMob => ({
        id: fish.indexOf(other),
        position: () => other.harness.actuator.at,
        view: () => ({}),
        identifier: () => other.identifier,
        school: () => other.school
    });
    for (const [index, at] of spots.entries()) {
        const identifier = typeof identifiers === 'string' ? identifiers : (identifiers[index] ?? 'minecraft:cod');
        const school: SchoolMembership = { leader: undefined, size: 1 };
        const self: { fish?: Fish } = {};
        const world: GoalWorld = {
            school: () => school,
            mobs: (radius) =>
                fish
                    .filter((other) => other !== self.fish)
                    .filter((other) => {
                        const there = other.harness.actuator.at;
                        const here = self.fish?.harness.actuator.at ?? at;
                        return Math.hypot(there.x - here.x, there.y - here.y, there.z - here.z) <= radius;
                    })
                    .map(mobOf)
        };
        const harness = new GoalHarness({
            identifier,
            goals: {
                'minecraft:flocking': { high_flock_limit: maxSchool },
                'minecraft:behavior.random_swim': { priority: 3, interval: 1 }
            },
            world,
            at,
            flags: { in_water: true }
        });
        harness.actuator.follow = false;
        self.fish = { harness, school, identifier };
        fish.push(self.fish);
    }
    return fish;
};

/** Ticks every fish together, the selector running on every other tick as a server's does. */
const run = (fish: readonly Fish[], ticks: number): void => {
    for (let tick = 0; tick < ticks; tick += 1) for (const one of fish) one.harness.entity.goals.tick(tick % 2 === 0);
};

const row = (count: number, gap = 1): EntityPosition[] =>
    Array.from({ length: count }, (_, index) => ({ x: index * gap + 0.5, y: 60, z: 0.5 }));

describe('minecraft:flocking', () => {
    it("gathers the fish of a type within 8 blocks into one school under one leader, as Java's FollowFlockLeaderGoal does", () => {
        const fish = pond(row(4));

        run(fish, 240);

        const leaders = fish.filter((one) => one.school.leader === undefined);
        expect(leaders).toHaveLength(1);
        expect(leaders[0]?.school.size).toBe(4);
        expect(fish.filter((one) => one.school.leader === leaders[0]?.school)).toHaveLength(3);
    });

    it('takes no more fish than the largest school, so the rest start their own', () => {
        const fish = pond(row(7), 'minecraft:salmon', 5);

        run(fish, 240);

        const largest = fish.find((one) => one.school.size === 5);
        expect(Math.max(...fish.map((one) => one.school.size))).toBe(5);
        expect(fish.filter((one) => one.school.leader === largest?.school)).toHaveLength(4);
    });

    it('never schools fish of different types', () => {
        const all = pond(row(4), ['minecraft:cod', 'minecraft:salmon', 'minecraft:cod', 'minecraft:salmon']);
        run(all, 240);

        expect(all.filter((one) => one.school.leader !== undefined)).toHaveLength(2);

        for (const one of all)
            if (one.school.leader !== undefined)
                expect(all.find((other) => other.school === one.school.leader)?.identifier).toBe(one.identifier);
    });

    it('paths a follower to its leader and stops it swimming at random', () => {
        const fish = pond(row(2));
        run(fish, 240);
        const follower = fish.find((one) => one.school.leader !== undefined);
        if (follower === undefined) throw new Error('no fish followed');

        expect(follower.harness.running()).toContain('minecraft:flocking');
        expect(follower.harness.running()).not.toContain('minecraft:behavior.random_swim');
        expect(follower.harness.actuator.count('moveTo')).toBeGreaterThan(0);
    });

    it('lets a follower go once its leader is more than 11 blocks away, and shrinks the school', () => {
        const fish = pond(row(2));
        run(fish, 240);
        const follower = fish.find((one) => one.school.leader !== undefined);
        const leader = fish.find((one) => one.school.leader === undefined);
        if (follower === undefined || leader === undefined) throw new Error('no school formed');

        leader.harness.actuator.at = { x: 40.5, y: 60, z: 0.5 };
        run(fish, 4);

        expect(follower.school.leader).toBeUndefined();
        expect(leader.school.size).toBe(1);
    });
});
