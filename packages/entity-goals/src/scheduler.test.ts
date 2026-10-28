import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from './harness';
import { voxelGrid } from './navigation/voxelGrid';
import type { GoalBlock, GoalItem, GoalMob, GoalWorld } from './world';

/**
 * The scheduler against a real mob's goal set.
 *
 * The bodies below are the zombie's base goals as the vanilla
 * `zombie.json` of Bedrock Dedicated Server 1.26.51.1 writes them, priorities
 * and all, so the test shows which goal wins each control flag rather than
 * asserting a rule in the abstract.
 */

const zombieGoals = {
    'minecraft:behavior.hurt_by_target': {
        priority: 1,
        entity_types: [{ filters: { operator: 'not', test: 'is_family', subject: 'other', value: 'breeze' } }]
    },
    'minecraft:behavior.equip_item': { priority: 2 },
    'minecraft:behavior.nearest_attackable_target': {
        priority: 2,
        reselect_targets: true,
        must_see: true,
        within_radius: 25,
        must_see_forget_duration: 17,
        entity_types: [
            {
                filters: { any_of: [{ test: 'is_family', subject: 'other', value: 'player' }] },
                max_dist: 35
            }
        ]
    },
    'minecraft:behavior.melee_box_attack': { priority: 4, can_spread_on_fire: true },
    'minecraft:behavior.stomp_turtle_egg': {
        priority: 5,
        goal_radius: 1.14,
        search_height: 2,
        interval: 20,
        search_range: 10,
        speed_multiplier: 1
    },
    'minecraft:behavior.pickup_items': {
        priority: 6,
        can_pickup_any_item: true,
        excluded_items: ['minecraft:glow_ink_sac'],
        pickup_based_on_chance: true,
        goal_radius: 2,
        max_dist: 3,
        speed_multiplier: 1
    },
    'minecraft:behavior.random_stroll': { priority: 7, speed_multiplier: 1 },
    'minecraft:behavior.look_at_player': { priority: 8, look_distance: 6 },
    'minecraft:behavior.random_look_around': { priority: 9 }
} as const;

const walker = {
    'minecraft:collision_box': { width: 0.6, height: 1.95 },
    'minecraft:navigation.walk': { can_path_over_water: true, avoid_water: true }
};

/** A 32 by 32 stone floor with three layers of air over it. */
const ground = voxelGrid([
    Array.from({ length: 32 }, () => '#'.repeat(32)),
    Array.from({ length: 32 }, () => '.'.repeat(32)),
    Array.from({ length: 32 }, () => '.'.repeat(32)),
    Array.from({ length: 32 }, () => '.'.repeat(32))
]);

interface ZombieWorldOptions {
    readonly players?: readonly GoalMob[];
    readonly eggs?: readonly GoalBlock[];
    readonly items?: readonly GoalItem[];
}

const zombieWorld = (options: ZombieWorldOptions = {}): GoalWorld => {
    let target: GoalMob | undefined;
    return {
        navigation: () => ground,
        mobs: () => options.players ?? [],
        players: () => options.players ?? [],
        items: () => options.items ?? [],
        blocks: () => options.eggs ?? [],
        canSee: () => true,
        target: () => target,
        setTarget: (mob) => {
            target = mob;
        },
        attack: () => undefined,
        damagers: () => []
    };
};

const spawn = (world: GoalWorld, options: { readonly random?: () => number } = {}): GoalHarness =>
    new GoalHarness({
        identifier: 'minecraft:zombie',
        goals: zombieGoals,
        components: walker,
        world,
        at: { x: 8.5, y: 1, z: 8.5 },
        ...options
    });

/** Ticks until the condition holds, so a goal gated on a chance is not flaky. */
const tickUntil = (harness: GoalHarness, ready: () => boolean, limit = 1000): boolean => {
    for (let tick = 0; tick < limit; tick += 1) {
        harness.tick();
        if (ready()) return true;
    }
    return false;
};

describe("the scheduler over a zombie's goal set", () => {
    it('idles with the stroll on move and a look goal on look', () => {
        const harness = spawn(zombieWorld());
        // The walk has to outlast one tick for the flag to still be held, so
        // the actuator does not teleport the entity to its destination here.
        harness.actuator.follow = false;

        expect(tickUntil(harness, () => harness.holderOf('move') !== undefined)).toBe(true);

        expect(harness.holderOf('move')).toBe('minecraft:behavior.random_stroll');
        expect(tickUntil(harness, () => harness.holderOf('look') !== undefined)).toBe(true);
        expect(harness.holderOf('look')).toBe('minecraft:behavior.random_look_around');
    });

    it('gives the look flag to look_at_player over random_look_around when a player is near', () => {
        const player = testMob('player', { x: 11.5, y: 1, z: 8.5 }, { families: ['player'] });
        const harness = spawn(zombieWorld({ players: [player] }), { random: () => 0.01 });

        harness.tick();

        expect(harness.holderOf('look')).not.toBe('minecraft:behavior.random_look_around');
    });

    it('lets the attack take move and look from the idle goals once a target is set', () => {
        const player = testMob('player', { x: 14.5, y: 1, z: 8.5 }, { families: ['player'] });
        const harness = spawn(zombieWorld({ players: [player] }));

        harness.tick(2);

        expect(harness.holderOf('move')).toBe('minecraft:behavior.melee_box_attack');
        expect(harness.holderOf('look')).toBe('minecraft:behavior.melee_box_attack');
        expect(harness.isRunning('minecraft:behavior.random_stroll')).toBe(false);
    });

    it('runs the targeting goal beside the attack, because it claims no flag', () => {
        const player = testMob('player', { x: 14.5, y: 1, z: 8.5 }, { families: ['player'] });
        const harness = spawn(zombieWorld({ players: [player] }));

        harness.tick(2);

        expect(harness.running()).toContain('minecraft:behavior.nearest_attackable_target');
        expect(harness.running()).toContain('minecraft:behavior.melee_box_attack');
    });

    it('reports the running goals in priority order', () => {
        const player = testMob('player', { x: 14.5, y: 1, z: 8.5 }, { families: ['player'] });
        const harness = spawn(zombieWorld({ players: [player] }));

        harness.tick(2);
        const running = harness.running();

        expect(running.indexOf('minecraft:behavior.nearest_attackable_target')).toBeLessThan(
            running.indexOf('minecraft:behavior.melee_box_attack')
        );
    });

    it('preempts the stroll mid-walk when a target appears', () => {
        const player = testMob('player', { x: 14.5, y: 1, z: 8.5 }, { families: ['player'] });
        let players: readonly GoalMob[] = [];
        let target: GoalMob | undefined;
        const world: GoalWorld = {
            navigation: () => ground,
            mobs: () => players,
            players: () => players,
            canSee: () => true,
            target: () => target,
            setTarget: (mob) => {
                target = mob;
            },
            attack: () => undefined,
            damagers: () => []
        };
        const harness = new GoalHarness({
            identifier: 'minecraft:zombie',
            goals: zombieGoals,
            components: walker,
            world,
            at: { x: 8.5, y: 1, z: 8.5 }
        });

        harness.actuator.follow = false;
        expect(tickUntil(harness, () => harness.holderOf('move') !== undefined)).toBe(true);
        expect(harness.holderOf('move')).toBe('minecraft:behavior.random_stroll');

        // The target scan runs one tick in ten, so the switch is not immediate.
        players = [player];
        expect(tickUntil(harness, () => harness.holderOf('move') === 'minecraft:behavior.melee_box_attack', 40)).toBe(
            true
        );
        expect(harness.isRunning('minecraft:behavior.random_stroll')).toBe(false);
    });

    it('gives move to stomp_turtle_egg over pickup_items and the stroll', () => {
        const harness = spawn(
            zombieWorld({ eggs: [{ position: { x: 10, y: 1, z: 8 }, identifier: 'minecraft:turtle_egg' }] }),
            { random: () => 0.01 }
        );

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.stomp_turtle_egg');
    });

    it('keeps an inactive goal registered', () => {
        const harness = spawn(zombieWorld());

        expect(harness.entity.goals.names()).toContain('minecraft:behavior.random_stroll');
        expect(harness.isRunning('minecraft:behavior.random_stroll')).toBe(false);
    });
});
