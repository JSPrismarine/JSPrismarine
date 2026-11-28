import type { EntityActuator, EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { defaultNavigationProfile } from './navigation/profile';
import type { NavigationProfile } from './navigation/profile';
import type { NavigationView } from './navigation/view';
import { voxelGrid } from './navigation/voxelGrid';
import { Navigator, navigatorOf, sweepNavigation } from './navigator';

/** A flat floor that counts block-fact reads so replans are directly observable. */
const countedView = (read: { count: number }): NavigationView => ({
    blockAt: (at) => {
        read.count++;
        return at.y <= 0 ? 'minecraft:stone' : 'minecraft:air';
    },
    isPassable: (at) => {
        read.count++;
        return at.y > 0;
    },
    isSolid: (at) => {
        read.count++;
        return at.y === 0;
    },
    isWater: () => {
        read.count++;
        return false;
    },
    isLava: () => {
        read.count++;
        return false;
    }
});

const actuatorAt = (position: EntityPosition, commands: EntityPosition[]): EntityActuator => ({
    position: () => position,
    moveTo: (destination) => commands.push(destination),
    stopMoving: () => undefined,
    lookAt: () => undefined,
    jump: () => undefined,
    randomTarget: () => undefined,
    nearestPlayer: () => undefined
});

const navigatorWith = (profile: () => NavigationProfile = () => defaultNavigationProfile) => {
    const read = { count: 0 };
    const commands: EntityPosition[] = [];
    const navigator = new Navigator({
        actuator: actuatorAt({ x: 0.5, y: 1, z: 0.5 }, commands),
        navigation: () => countedView(read),
        profile
    });
    return { navigator, read, commands };
};

describe('Navigator', () => {
    it('reuses a usable route until Java’s 20-tick recomputation interval', () => {
        const { navigator, read, commands } = navigatorWith();
        const mate = { x: 8.5, y: 1, z: 0.5 };

        expect(navigator.moveTo(mate, 1, 3)).toBe(true);
        const initialReads = read.count;
        for (let tick = 1; tick < 20; tick++) {
            expect(navigator.moveTo(mate, 1, 3)).toBe(true);
        }
        expect(read.count).toBe(initialReads);

        expect(navigator.moveTo(mate, 1, 3)).toBe(true);

        expect(read.count).toBeGreaterThan(initialReads);
        expect(commands).toHaveLength(21);
    });

    it('replans immediately when the destination block, goal radius, or navigation profile changes', () => {
        let profile = defaultNavigationProfile;
        const { navigator, read } = navigatorWith(() => profile);

        expect(navigator.moveTo({ x: 8.5, y: 1, z: 0.5 }, 1, 3)).toBe(true);
        let previousReads = read.count;
        expect(navigator.moveTo({ x: 9.5, y: 1, z: 0.5 }, 1, 3)).toBe(true);
        expect(read.count).toBeGreaterThan(previousReads);

        previousReads = read.count;
        expect(navigator.moveTo({ x: 9.5, y: 1, z: 0.5 }, 1, 2)).toBe(true);
        expect(read.count).toBeGreaterThan(previousReads);

        profile = { ...profile, canOpenDoors: true };
        previousReads = read.count;
        expect(navigator.moveTo({ x: 9.5, y: 1, z: 0.5 }, 1, 2)).toBe(true);
        expect(read.count).toBeGreaterThan(previousReads);
    });

    it('discards the retained route when a walk is stopped', () => {
        const { navigator, read } = navigatorWith();
        const mate = { x: 8.5, y: 1, z: 0.5 };

        expect(navigator.moveTo(mate, 1, 3)).toBe(true);
        const initialReads = read.count;
        navigator.stop();

        expect(navigator.moveTo(mate, 1, 3)).toBe(true);

        expect(read.count).toBeGreaterThan(initialReads);
    });
});

/** An actuator whose position a test moves by hand, with every command it was given. */
const movableActuator = (start: EntityPosition) => {
    const at = { ...start };
    const log: string[] = [];
    const actuator: EntityActuator = {
        position: () => at,
        width: () => 0.6,
        movementSpeed: () => 0.25,
        moveTo: (destination) => log.push(`moveTo ${destination.x},${destination.y},${destination.z}`),
        stopMoving: () => log.push('stopMoving'),
        lookAt: () => undefined,
        jump: () => undefined,
        randomTarget: () => undefined,
        nearestPlayer: () => undefined
    };
    return { at, log, actuator };
};

/** A stone floor at y 0 under ten by ten blocks of air, with `walls` of stone standing on it. */
const room = (walls: readonly string[] = []) => {
    const floor = Array.from({ length: 10 }, () => '#'.repeat(10));
    const open = Array.from({ length: 10 }, (_, z) => walls[z] ?? '.'.repeat(10));
    return voxelGrid([floor, open, open, Array.from({ length: 10 }, () => '.'.repeat(10))]);
};

describe('Navigator walks', () => {
    it('walks the closest route toward a destination no route reaches, as Java follows a partial path', () => {
        // A wall across the room at x 5.
        const view = room(Array.from({ length: 10 }, () => '.....#....'));
        const { actuator, log } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });

        expect(navigator.canReach({ x: 8.5, y: 1, z: 1.5 }, 0)).toBe(false);
        expect(navigator.plan({ x: 8.5, y: 1, z: 1.5 }, 0)).toBe('partial');
        expect(navigator.moveTo({ x: 8.5, y: 1, z: 1.5 }, 1, 0)).toBe(true);
        expect(navigator.complete).toBe(false);
        expect(log.at(-1)?.startsWith('moveTo')).toBe(true);
    });

    it('stops the body when no step takes it any closer', () => {
        const view = room();
        const { actuator, log } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });
        navigator.moveTo({ x: 4.5, y: 1, z: 1.5 }, 1, 0);

        // Straight up, where a walker gets no closer from any neighbor.
        expect(navigator.moveTo({ x: 1.5, y: 8, z: 1.5 }, 1, 0)).toBe(false);

        expect(navigator.walking).toBe(false);
        expect(log.at(-1)).toBe('stopMoving');
    });

    it("moves on to the next node by horizontal distance, as Java's followThePath does", () => {
        const view = room();
        const { at, actuator } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });
        navigator.moveTo({ x: 5.5, y: 1, z: 1.5 }, 1, 0);
        const first = navigator.pathStep()?.next;
        if (first === undefined) throw new Error('the walk has no path');

        // Within the reach across the ground of the first node, and half a block above it.
        at.x = first.x + 0.5 + 0.4;
        at.y = first.y + 0.5;
        navigator.tick();

        expect(navigator.pathStep()?.next).not.toEqual(first);
    });

    it('counts a body stuck once a hundred ticks move it less than its speed allows', () => {
        const view = room();
        const { actuator, log } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });
        navigator.moveTo({ x: 8.5, y: 1, z: 1.5 }, 1, 0);

        const running: boolean[] = [];
        for (let tick = 0; tick < 101; tick += 1) running.push(navigator.tick());

        expect(running.slice(0, 100).every(Boolean)).toBe(true);
        expect(running[100]).toBe(false);
        expect(navigator.stuck).toBe(true);
        expect(log.at(-1)).toBe('stopMoving');
    });

    it('is not stuck while the body keeps moving', () => {
        const view = room();
        const { at, actuator } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });
        navigator.moveTo({ x: 1.5, y: 1, z: 8.5 }, 1, 0);

        // Two blocks across in each hundred ticks, more than the 1.56 a quarter-speed walker needs.
        for (let tick = 0; tick < 250; tick += 1) {
            at.x += 0.02;
            navigator.tick();
        }

        expect(navigator.stuck).toBe(false);
        expect(navigator.walking).toBe(true);
    });

    it('plans again when a block placed since closes the path ahead', () => {
        const blocks = new Set<string>();
        const base = room();
        const view: NavigationView = {
            ...base,
            isPassable: (p) => !blocks.has(`${p.x},${p.y},${p.z}`) && base.isPassable(p),
            isSolid: (p) => blocks.has(`${p.x},${p.y},${p.z}`) || base.isSolid(p)
        };
        const { actuator } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile });
        navigator.moveTo({ x: 1.5, y: 1, z: 8.5 }, 1, 0);
        const next = navigator.pathStep()?.next;
        if (next === undefined) throw new Error('the walk has no path');

        blocks.add(`${next.x},${next.y},${next.z}`);
        blocks.add(`${next.x},${next.y + 1},${next.z}`);
        for (let tick = 0; tick < 20; tick += 1) navigator.tick();

        expect(navigator.walking).toBe(true);
        expect(navigator.pathStep()?.next).not.toEqual(next);
    });

    it('advances once a game tick whether a goal or the sweep ticks it', () => {
        const view = room();
        const owner = {};
        const { actuator } = movableActuator({ x: 1.5, y: 1, z: 1.5 });
        const navigator = navigatorOf(
            owner,
            () => new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile, owner })
        );
        expect(
            navigatorOf(
                owner,
                () => new Navigator({ actuator, navigation: () => view, profile: () => defaultNavigationProfile })
            )
        ).toBe(navigator);
        navigator.moveTo({ x: 8.5, y: 1, z: 1.5 }, 1, 0);
        sweepNavigation(owner);

        // A goal that ticks on every other game tick, as a selector-tick goal does, and a sweep on
        // every one: the stuck check sees one advance a game tick, so it fires on the 101st.
        for (let tick = 0; tick < 99; tick += 1) {
            if (tick % 2 === 0) {
                navigator.tick();
                navigator.tick();
            }
            sweepNavigation(owner);
        }
        expect(navigator.stuck).toBe(false);
        sweepNavigation(owner);
        expect(navigator.stuck).toBe(true);
    });
});

describe('Navigator.randomTarget', () => {
    /** Three layers of stone under open air, with the walker standing on top at y 3. */
    const ground = voxelGrid([
        ...Array.from({ length: 3 }, () => Array.from({ length: 21 }, () => '#'.repeat(21))),
        ...Array.from({ length: 10 }, () => Array.from({ length: 21 }, () => '.'.repeat(21)))
    ]);
    /** Draws in order, each in [0, 1); 0.5 is no offset. */
    const draws = (values: number[]) => () => values.shift() ?? 0.5;
    const walkerAt = () => {
        const { actuator } = movableActuator({ x: 10.5, y: 3, z: 10.5 });
        return new Navigator({ actuator, navigation: () => ground, profile: () => defaultNavigationProfile });
    };

    it("lifts a draw inside the ground onto it, as Java's LandRandomPos does", () => {
        // x + 2 and y - 2 of 7: inside the stone.
        const target = walkerAt().randomTarget(10, 7, draws([0.6, 0.5 - 2 / 14, 0.5]), 1);

        expect(target).toEqual({ x: 12.5, y: 3, z: 10.5 });
    });

    it('refuses a draw with no ground under it', () => {
        // y + 3: in the air.
        expect(walkerAt().randomTarget(10, 7, draws([0.6, 0.5 + 3 / 14, 0.5]), 1)).toBeUndefined();
    });
});
