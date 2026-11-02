import type { EntityActuator, EntityPosition } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { defaultNavigationProfile } from './navigation/profile';
import type { NavigationProfile } from './navigation/profile';
import type { NavigationView } from './navigation/view';
import { Navigator } from './navigator';

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
