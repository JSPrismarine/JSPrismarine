import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import type { GoalWorld } from '../world';

/**
 * The movement family, which holds the `move` flag and walks through the
 * navigator, so these tests watch both the actuator and the path finder.
 */

/** A flat square of stone with three layers of air over it. */
const flatWorld = (size = 32): GoalWorld => {
    const floor = Array.from({ length: size }, () => '#'.repeat(size));
    const air = Array.from({ length: size }, () => '.'.repeat(size));
    const view = voxelGrid([floor, air, air, air]);
    return { navigation: () => view };
};

const walker = { 'minecraft:collision_box': { width: 0.6, height: 1.8 }, 'minecraft:navigation.walk': {} };

describe('minecraft:behavior.random_stroll', () => {
    it('claims the move flag and walks to a position the path finder reached', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.random_stroll': {
                    priority: 6,
                    speed_multiplier: 0.8,
                    interval: 0,
                    xz_dist: 6,
                    y_dist: 1
                }
            },
            components: walker,
            world: flatWorld(),
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.random_stroll');
        expect(harness.actuator.count('moveTo')).toBeGreaterThan(0);
    });

    it('does not start when the interval roll fails', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.random_stroll': { priority: 6, interval: 120 } },
            components: walker,
            world: flatWorld(),
            at: { x: 4.5, y: 1, z: 4.5 },
            random: () => 0.9
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });

    it('does not start when the path finder reaches nothing', () => {
        const view = voxelGrid([['#'], ['.']]);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.random_stroll': { priority: 6, interval: 0 } },
            components: walker,
            world: { navigation: () => view },
            at: { x: 0.5, y: 1, z: 0.5 },
            random: () => 0.9
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.float', () => {
    it('claims only the jump flag and jumps while the entity is in a liquid', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.float': { priority: 0, chance_per_tick_to_float: 1 } },
            flags: { in_water: true }
        });

        harness.tick(3);

        expect(harness.holderOf('jump')).toBe('minecraft:behavior.float');
        expect(harness.holderOf('move')).toBeUndefined();
        expect(harness.actuator.count('jump')).toBe(3);
    });

    it('stays off on dry land', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.float': { priority: 0 } },
            flags: { in_water: false }
        });

        harness.tick(3);

        expect(harness.actuator.count('jump')).toBe(0);
    });
});

describe('minecraft:behavior.panic', () => {
    it('runs only after something damaged the entity', () => {
        const calm = new GoalHarness({
            goals: { 'minecraft:behavior.panic': { priority: 1, speed_multiplier: 1.25 } },
            components: walker,
            world: flatWorld(),
            at: { x: 8.5, y: 1, z: 8.5 }
        });
        calm.tick();
        expect(calm.running()).toEqual([]);

        const hurt = new GoalHarness({
            goals: { 'minecraft:behavior.panic': { priority: 1, speed_multiplier: 1.25 } },
            components: walker,
            world: {
                ...flatWorld(),
                damagers: () => [{ mob: undefined, cause: 'entity_attack', total: 2 }]
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });
        hurt.tick();
        expect(hurt.holderOf('move')).toBe('minecraft:behavior.panic');
        expect(hurt.actuator.count('moveTo')).toBeGreaterThan(0);
    });

    it('ignores mob damage when ignore_mob_damage is set', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.panic': { priority: 1, ignore_mob_damage: true } },
            components: walker,
            world: {
                ...flatWorld(),
                damagers: () => [{ mob: testMob('zombie', { x: 1, y: 1, z: 1 }), cause: 'entity_attack', total: 2 }]
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.avoid_mob_type', () => {
    it('walks away from the threat rather than toward it', () => {
        const wolf = testMob('wolf', { x: 4.5, y: 1, z: 8.5 }, { families: ['wolf'] });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.avoid_mob_type': {
                    priority: 3,
                    entity_types: [
                        {
                            filters: { test: 'is_family', subject: 'other', value: 'wolf' },
                            max_dist: 10,
                            sprint_speed_multiplier: 1.5
                        }
                    ]
                }
            },
            components: walker,
            world: { ...flatWorld(), mobs: () => [wolf] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.avoid_mob_type');
        const walk = harness.actuator.log.find((entry) => entry.startsWith('moveTo'));
        expect(walk).toBeDefined();
        expect(walk).toContain('@1.5');
    });

    it('stays put when nothing it avoids is near', () => {
        const cow = testMob('cow', { x: 4.5, y: 1, z: 8.5 }, { families: ['cow'] });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.avoid_mob_type': {
                    priority: 3,
                    entity_types: [{ filters: { test: 'is_family', subject: 'other', value: 'wolf' }, max_dist: 10 }]
                }
            },
            components: walker,
            world: { ...flatWorld(), mobs: () => [cow] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.move_to_water', () => {
    it('walks to the water block the world found', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.move_to_water': {
                    priority: 6,
                    search_range: 16,
                    search_height: 2,
                    tick_interval: 1
                }
            },
            components: walker,
            world: {
                ...flatWorld(),
                blocks: () => [{ position: { x: 10, y: 1, z: 8 }, identifier: 'minecraft:water' }]
            },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.actuator.count('moveTo')).toBeGreaterThan(0);
    });
});

describe('minecraft:behavior.follow_mob', () => {
    it('follows a mob its filters accept and stops inside stop_distance', () => {
        const friend = testMob('friend', { x: 12.5, y: 1, z: 8.5 }, { families: ['villager'] });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.follow_mob': {
                    priority: 5,
                    search_range: 16,
                    stop_distance: 2,
                    filters: { test: 'is_family', subject: 'other', value: 'villager' }
                }
            },
            components: walker,
            world: { ...flatWorld(), mobs: () => [friend] },
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.follow_mob');
        expect(harness.actuator.log).toContain('lookAt 12.5,1,8.5');
    });
});

describe('minecraft:behavior.flee_sun', () => {
    it('only walks to a position the sky does not reach', () => {
        const floor = Array.from({ length: 16 }, () => '#'.repeat(16));
        const sunlit = Array.from({ length: 16 }, () => 's'.repeat(16));

        const openSky = voxelGrid([floor, sunlit, sunlit]);

        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.flee_sun': { priority: 2, speed_multiplier: 1 } },
            components: walker,
            world: { navigation: () => openSky },
            at: { x: 8.5, y: 1, z: 8.5 },
            random: () => 0.5
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.mount_pathing', () => {
    it('stays out of the way of a mob that is riding nothing', () => {
        // The adult zombie carries this at priority 2 and `melee_box_attack` at 4, and both
        // claim `move` and `look`. Starting on nothing more than having a target took those
        // flags off the attack and left every zombie in the world standing still in front of
        // the player it had chosen.
        const victim = testMob('victim', { x: 8, y: 1, z: 8.5 });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.mount_pathing': { priority: 2, speed_multiplier: 1.5, track_target: true },
                'minecraft:behavior.melee_box_attack': { priority: 4, speed_multiplier: 1.25 }
            },
            components: walker,
            world: {
                ...flatWorld(),
                target: () => victim,
                mobs: () => [victim],
                canSee: () => true,
                attack: () => undefined,
                knockback: () => undefined
            },
            at: { x: 2.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.running()).not.toContain('minecraft:behavior.mount_pathing');
        expect(harness.holderOf('move')).toBe('minecraft:behavior.melee_box_attack');
    });

    it('walks a mounted mob to the target it has', () => {
        const victim = testMob('victim', { x: 8, y: 1, z: 8.5 });
        const horse = testMob('horse', { x: 2.5, y: 1, z: 8.5 });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.mount_pathing': { priority: 2, speed_multiplier: 1.5, track_target: true }
            },
            components: walker,
            world: { ...flatWorld(), target: () => victim, vehicle: () => horse },
            at: { x: 2.5, y: 1, z: 8.5 }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.mount_pathing');
        expect(harness.actuator.count('moveTo')).toBeGreaterThan(0);
    });
});
