import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
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
    it('reuses the planned melee path at the first re-path interval', () => {
        const victim = testMob('victim', { x: 8, y: 1, z: 0 });
        const blocks = voxelGrid([['##########'], ['..........'], ['..........']]);
        let passabilityReads = 0;
        const navigation = {
            ...blocks,
            isPassable: (position: { readonly x: number; readonly y: number; readonly z: number }) => {
                passabilityReads += 1;
                return blocks.isPassable(position);
            }
        };
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.melee_box_attack': { priority: 3 } },
            world: { ...combatWorld(victim), navigation: () => navigation },
            at: { x: 0.5, y: 1, z: 0.5 }
        });
        harness.actuator.follow = false;

        harness.tick();
        const initialReads = passabilityReads;
        expect(initialReads).toBeLessThan(85);

        harness.tick(9);
        expect(passabilityReads).toBe(initialReads);

        harness.tick();
        expect(passabilityReads).toBe(initialReads);
    });

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

    it("leaps on one selector tick in reducedTickDelay(5), as Java's LeapAtTargetGoal does", () => {
        const good = testMob('good', { x: 3, y: 0, z: 0 });
        const bounds: number[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.leap_at_target': { priority: 4 } },
            world: combatWorld(good),
            flags: { on_ground: true },
            randomInt: (bound) => {
                bounds.push(bound);
                return 1;
            }
        });

        harness.tick();

        expect(bounds).toEqual([3]);
        expect(harness.running()).toEqual([]);
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

describe('minecraft:behavior.use_kinetic_weapon', () => {
    it('leaves the melee attack its flags while the mob is on foot', () => {
        // The adult zombie carries both, this one at priority 3 and the melee attack at 4,
        // and both claim `move` and `look`. Starting on foot took those flags off the attack
        // and left every zombie that had chosen a player standing still in front of them.
        const victim = testMob('victim', { x: 6, y: 0, z: 0 });
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.use_kinetic_weapon': { priority: 3, approach_distance: 10 },
                'minecraft:behavior.melee_box_attack': { priority: 4, speed_multiplier: 1.25 }
            },
            world: combatWorld(victim)
        });

        harness.tick();

        expect(harness.running()).not.toContain('minecraft:behavior.use_kinetic_weapon');
        expect(harness.holderOf('move')).toBe('minecraft:behavior.melee_box_attack');
    });

    it('rides the target down once the mob is mounted', () => {
        const victim = testMob('victim', { x: 6, y: 0, z: 0 });
        const horse = testMob('horse', { x: 0, y: 0, z: 0 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.use_kinetic_weapon': { priority: 3, approach_distance: 10 } },
            world: { ...combatWorld(victim), vehicle: () => horse }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.use_kinetic_weapon');
    });
});

describe('minecraft:behavior.guardian_attack', () => {
    const beam = (families: readonly string[], at: number) => {
        const hits: number[] = [];
        let target: ReturnType<typeof testMob> | undefined = testMob('player', { x: at, y: 0, z: 0 });
        let tick = 0;
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.guardian_attack': { priority: 4 } },
            components: { 'minecraft:type_family': { family: families } },
            world: {
                target: () => target,
                setTarget: (mob) => {
                    target = mob;
                },
                canSee: () => true,
                attack: () => hits.push(tick)
            }
        });
        for (tick = 1; tick <= 120; tick += 1) harness.tick();
        return { hits, target };
    };

    it('locks for 10 ticks, charges for 80, hits once and lets the target go', () => {
        const { hits, target } = beam(['guardian'], 6);
        expect(hits).toEqual([90]);
        expect(target).toBeUndefined();
    });

    it('charges for 60 on an elder guardian', () => {
        expect(beam(['guardian_elder'], 6).hits).toEqual([70]);
    });

    it('stops beaming a target within 3 blocks, unless it is an elder', () => {
        expect(beam(['guardian'], 2).hits).toEqual([]);
        expect(beam(['guardian_elder'], 2).hits).toEqual([70]);
    });
});

describe('minecraft:behavior.knockback_roar', () => {
    it("hurts what the damage filters accept and throws back what the knockback filters accept, as Java's Ravager.roar", () => {
        const player = testMob('player', { x: 2, y: 0, z: 0 }, { families: ['player'] });
        const pillager = testMob('pillager', { x: -2, y: 0, z: 0 }, { families: ['illager'] });
        const blows: (readonly [string | number, number | undefined])[] = [];
        const thrown: (string | number)[] = [];
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.knockback_roar': {
                    priority: 1,
                    duration: 1,
                    attack_time: 0.5,
                    knockback_damage: 6,
                    knockback_range: 4,
                    damage_filters: { test: 'is_family', subject: 'other', operator: '!=', value: 'illager' }
                }
            },
            world: {
                ...combatWorld(player),
                mobs: () => [player, pillager],
                attack: (mob, damage) => blows.push([mob.id, damage]),
                knockback: (mob) => thrown.push(mob.id)
            }
        });

        harness.tick(20);

        expect(blows).toEqual([['player', 6]]);
        expect(thrown).toEqual(['player', 'pillager']);
    });
});

describe('minecraft:behavior.wither_random_attack_pos_goal', () => {
    it("flies across to within 3 blocks of its target and 5 above it, as Java's WitherBoss.aiStep", () => {
        const size = 32;
        const air = Array.from({ length: size }, () => '.'.repeat(size));
        const view = voxelGrid([
            Array.from({ length: size }, () => '#'.repeat(size)),
            ...Array.from({ length: 10 }, () => air)
        ]);
        const target = testMob('target', { x: 24.5, y: 1, z: 4.5 });
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.wither_random_attack_pos_goal': { priority: 1 } },
            components: {
                'minecraft:health': { value: 300, max: 300 },
                'minecraft:navigation.hover': { can_path_over_water: true },
                'minecraft:can_fly': {}
            },
            world: { ...combatWorld(target), navigation: () => view },
            at: { x: 4.5, y: 1, z: 4.5 }
        });

        harness.tick(40);

        const here = harness.actuator.at;
        expect(Math.hypot(here.x - 24.5, here.z - 4.5)).toBeLessThanOrEqual(3);
        expect(here.y).toBeGreaterThanOrEqual(5);
    });
});
