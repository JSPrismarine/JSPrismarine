import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import type { GoalMob, GoalWorld } from '../world';

/**
 * The attacking family, which reads the target the targeting goals set and
 * holds `move` and `look` while it closes in.
 */

/** A world with one fixed target that records every attack, shot and push. */
const combatWorld = (
    target: GoalMob | undefined,
    options: { readonly canSee?: boolean } = {}
): GoalWorld & {
    readonly hits: (string | number)[];
    readonly shots: (string | undefined)[];
    readonly pushes: number[];
} => {
    const hits: (string | number)[] = [];
    const shots: (string | undefined)[] = [];
    const pushes: number[] = [];
    return {
        hits,
        shots,
        pushes,
        target: () => target,
        setTarget: () => undefined,
        mobs: () => (target === undefined ? [] : [target]),
        canSee: () => options.canSee ?? true,
        attack: (mob) => hits.push(mob.id),
        shoot: (_mob, projectile) => shots.push(projectile),
        push: (velocity) => pushes.push(velocity.y),
        knockback: () => undefined
    };
};

describe('minecraft:behavior.melee_box_attack', () => {
    it('claims move and look and walks at the target', () => {
        const victim = testMob('victim', { x: 8, y: 0, z: 0 });
        const world = combatWorld(victim);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.melee_box_attack': { priority: 3, speed_multiplier: 1.25 } },
            world
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.melee_box_attack');
        expect(harness.holderOf('look')).toBe('minecraft:behavior.melee_box_attack');
        expect(harness.actuator.log).toContain('moveTo 8,0,0 @1.25');
    });

    it('swings once the target is inside reach and then waits out the cooldown', () => {
        const victim = testMob('victim', { x: 1, y: 0, z: 0 });
        const world = combatWorld(victim);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.melee_box_attack': { priority: 3, cooldown_time: 1 } },
            world
        });

        harness.tick(5);

        expect(world.hits).toEqual(['victim']);
    });

    it('does not start without a target', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.melee_box_attack': { priority: 3 } },
            world: combatWorld(undefined)
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.delayed_attack', () => {
    it('lands the damage part way into the swing rather than at its start', () => {
        const victim = testMob('victim', { x: 1, y: 0, z: 0 });
        const world = combatWorld(victim);
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.delayed_attack': {
                    priority: 4,
                    attack_duration: 1,
                    hit_delay_pct: 0.5,
                    cooldown_time: 2
                }
            },
            world
        });

        harness.tick(5);
        expect(world.hits).toEqual([]);

        harness.tick(8);
        expect(world.hits).toEqual(['victim']);
    });
});

describe('minecraft:behavior.ranged_attack', () => {
    it('shoots on the interval while the target stays in sight', () => {
        const victim = testMob('victim', { x: 6, y: 0, z: 0 });
        const world = combatWorld(victim);
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.ranged_attack': {
                    priority: 2,
                    attack_radius: 15,
                    attack_interval_min: 1,
                    attack_interval_max: 1
                }
            },
            world
        });

        harness.tick(40);

        expect(world.shots.length).toBeGreaterThan(1);
    });

    it('holds fire while it cannot see the target', () => {
        const victim = testMob('victim', { x: 6, y: 0, z: 0 });
        const world = combatWorld(victim, { canSee: false });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.ranged_attack': { priority: 2, attack_radius: 15 } },
            world
        });

        harness.tick(40);

        expect(world.shots).toEqual([]);
    });
});

describe('minecraft:behavior.leap_at_target', () => {
    it('leaps only from the ground and only between 2 and 4 blocks', () => {
        const near = testMob('near', { x: 1, y: 0, z: 0 });
        const good = testMob('good', { x: 3, y: 0, z: 0 });

        const tooClose = new GoalHarness({
            goals: { 'minecraft:behavior.leap_at_target': { priority: 4, yd: 0.4 } },
            world: combatWorld(near),
            flags: { on_ground: true }
        });
        tooClose.tick(5);
        expect(tooClose.running()).toEqual([]);

        const world = combatWorld(good);
        const leaping = new GoalHarness({
            goals: { 'minecraft:behavior.leap_at_target': { priority: 4, yd: 0.4 } },
            world,
            flags: { on_ground: true },
            random: () => 0.1
        });
        leaping.tick();
        expect(world.pushes).toEqual([0.4]);
    });

    it('refuses while the entity is in the air and must_be_on_ground is set', () => {
        const good = testMob('good', { x: 3, y: 0, z: 0 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.leap_at_target': { priority: 4 } },
            world: combatWorld(good),
            flags: { on_ground: false }
        });

        harness.tick(5);

        expect(harness.running()).toEqual([]);
    });
});

describe('minecraft:behavior.swell', () => {
    it('takes the move flag inside start_distance and lets go past stop_distance', () => {
        const near = testMob('player', { x: 2, y: 0, z: 0 });
        const close = new GoalHarness({
            goals: { 'minecraft:behavior.swell': { priority: 2, start_distance: 2.5, stop_distance: 6 } },
            world: combatWorld(near)
        });
        close.tick();
        expect(close.holderOf('move')).toBe('minecraft:behavior.swell');

        const far = testMob('player', { x: 9, y: 0, z: 0 });
        const away = new GoalHarness({
            goals: { 'minecraft:behavior.swell': { priority: 2, start_distance: 2.5, stop_distance: 6 } },
            world: combatWorld(far)
        });
        away.tick();
        expect(away.running()).toEqual([]);
    });
});

describe('minecraft:behavior.sonic_boom', () => {
    it('charges for the duration and then hits through the air', () => {
        const victim = testMob('victim', { x: 12, y: 0, z: 0 });
        const world = combatWorld(victim);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.sonic_boom': { priority: 3, duration: 0.5, attack_cooldown: 2 } },
            world
        });

        harness.tick(4);
        expect(world.hits).toEqual([]);

        harness.tick(8);

        expect(world.hits).toEqual(['victim']);
    });
});
