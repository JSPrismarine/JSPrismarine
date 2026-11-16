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
            // Under a block wide, so its path fits the one-block corridor.
            components: { 'minecraft:collision_box': { width: 0.6, height: 1.8 } },
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

    it('walks toward a target beyond its attack radius and stops once inside it', () => {
        // Java's ranged goals start with any target and moveTo it until it is within attackRadius.
        const walks = (distance: number): number => {
            const harness = new GoalHarness({
                goals: { 'minecraft:behavior.ranged_attack': { priority: 2, attack_radius: 15 } },
                world: combatWorld(testMob('victim', { x: distance, y: 0, z: 0 }))
            });
            harness.tick(3);
            expect(harness.isRunning('minecraft:behavior.ranged_attack')).toBe(true);
            return harness.actuator.count('moveTo');
        };

        expect(walks(17)).toBeGreaterThan(0);
        expect(walks(10)).toBe(0);
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
    const goals = {
        'minecraft:behavior.use_kinetic_weapon': { priority: 3, approach_distance: 10 },
        'minecraft:behavior.melee_box_attack': { priority: 4, speed_multiplier: 1.25 }
    };
    /** A world whose mob holds `held`, of which only spears carry `minecraft:kinetic_weapon`. */
    const holding = (held: string | undefined, extra: GoalWorld = {}): GoalWorld => ({
        ...combatWorld(testMob('victim', { x: 6, y: 0, z: 0 })),
        carriedItem: () => held,
        itemHasComponent: (identifier, component) =>
            component === 'minecraft:kinetic_weapon' && identifier.endsWith('_spear'),
        ...extra
    });

    it("charges on foot with a spear, as Java's SpearUseGoal does", () => {
        const harness = new GoalHarness({ goals, world: holding('minecraft:iron_spear') });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.use_kinetic_weapon');
    });

    it('charges mounted with a spear', () => {
        const horse = testMob('horse', { x: 0, y: 0, z: 0 });
        const harness = new GoalHarness({ goals, world: holding('minecraft:iron_spear', { vehicle: () => horse }) });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.use_kinetic_weapon');
    });

    it('leaves the melee attack its flags without a spear in hand', () => {
        // The adult zombie carries both, this one at priority 3 and the melee attack at 4, and
        // both claim `move` and `look`; a zombie with a sword or nothing must still swing.
        for (const held of ['minecraft:iron_sword', undefined]) {
            const harness = new GoalHarness({ goals, world: holding(held) });

            harness.tick();

            expect(harness.running()).not.toContain('minecraft:behavior.use_kinetic_weapon');
            expect(harness.holderOf('move')).toBe('minecraft:behavior.melee_box_attack');
        }
    });

    it('stops once the spear leaves its hand', () => {
        let held: string | undefined = 'minecraft:iron_spear';
        const harness = new GoalHarness({ goals, world: { ...holding(undefined), carriedItem: () => held } });

        harness.tick();
        held = undefined;
        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.melee_box_attack');
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

/** The evoker's three spells as the vanilla file writes them. */
const EVOKER_SPELLS = {
    priority: 2,
    summon_choices: [
        {
            cast_duration: 2,
            cooldown_time: 5,
            max_activation_range: 3,
            min_activation_range: 0,
            sequence: [
                {
                    base_delay: 1,
                    shape: 'circle',
                    num_entities_spawned: 5,
                    delay_per_summon: 0,
                    entity_type: 'minecraft:evocation_fang',
                    size: 1.5,
                    target: 'self'
                },
                {
                    base_delay: 0.15,
                    num_entities_spawned: 8,
                    shape: 'circle',
                    delay_per_summon: 0,
                    entity_type: 'minecraft:evocation_fang',
                    size: 2.5,
                    target: 'self'
                }
            ],
            weight: 3
        },
        {
            cast_duration: 2,
            cooldown_time: 5,
            min_activation_range: 3,
            sequence: [
                {
                    base_delay: 1,
                    delay_per_summon: 0.05,
                    num_entities_spawned: 16,
                    shape: 'line',
                    entity_type: 'minecraft:evocation_fang',
                    size: 20,
                    target: 'self'
                }
            ],
            weight: 3
        },
        {
            cast_duration: 5,
            cooldown_time: 17,
            sequence: [
                {
                    base_delay: 5,
                    entity_type: 'minecraft:vex',
                    shape: 'circle',
                    num_entities_spawned: 3,
                    summon_cap_radius: 16,
                    size: 1,
                    summon_cap: 8,
                    summon_event: 'minecraft:add_damage_timer',
                    target: 'self'
                }
            ],
            weight: 1
        }
    ]
};

/** One summon the spell world was asked for. */
interface Summoned {
    readonly tick: number;
    readonly identifier: string;
    readonly x: number;
    readonly z: number;
    readonly warmup: unknown;
    readonly owned: boolean | undefined;
}

/** A world that records every summon and every event fired on one, with `near` mobs around the caster. */
const spellWorld = (target: GoalMob | undefined, near: readonly GoalMob[] = []) => {
    let clock = 0;
    const summoned: Summoned[] = [];
    const fired: string[] = [];
    const world: GoalWorld = {
        target: () => target,
        mobs: () => near,
        gameTime: () => clock,
        spawn: (identifier, position, _event, options) => {
            summoned.push({
                tick: clock,
                identifier,
                x: position.x,
                z: position.z,
                warmup: options?.data?.['warmup'],
                owned: options?.owned
            });
            return testMob(`summon-${summoned.length}`, position, { identifier });
        },
        fireOn: (mob, event) => fired.push(`${String(mob.id)} ${event}`)
    };
    return {
        world,
        summoned,
        fired,
        run: (harness: GoalHarness, ticks: number) => {
            for (let index = 0; index < ticks; index += 1) {
                clock += 1;
                harness.tick();
            }
        }
    };
};

describe('minecraft:behavior.summon_entity', () => {
    it("summons the evoker's three vexes first, owned and on their damage timer, then a line of fangs", () => {
        const spells = spellWorld(testMob('player', { x: 8, y: 0, z: 0 }));
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.summon_entity': EVOKER_SPELLS },
            world: spells.world
        });

        spells.run(harness, 300);

        const vexes = spells.summoned.filter((entry) => entry.identifier === 'minecraft:vex');
        expect(vexes).toHaveLength(3);
        expect(vexes.every((vex) => vex.owned === true && vex.tick === vexes[0]?.tick)).toBe(true);
        expect(spells.fired).toEqual([
            'summon-1 minecraft:add_damage_timer',
            'summon-2 minecraft:add_damage_timer',
            'summon-3 minecraft:add_damage_timer'
        ]);

        const fangs = spells.summoned.filter((entry) => entry.identifier === 'minecraft:evocation_fang');
        const firstCast = fangs.filter((fang) => fang.tick === fangs[0]?.tick);
        expect(firstCast).toHaveLength(16);
        expect(firstCast.map((fang) => fang.x)).toEqual(Array.from({ length: 16 }, (_, index) => 1.25 * (index + 1)));
        expect(firstCast.map((fang) => fang.warmup)).toEqual(Array.from({ length: 16 }, (_, index) => index));
        // Java's attack spell waits out the summon's 100 tick cast, then its own 20 tick warm-up.
        expect((fangs[0]?.tick ?? 0) - (vexes[0]?.tick ?? 0)).toBeGreaterThanOrEqual(20);
    });

    it('casts two rings of fangs at a target within 3 blocks, the second turned and three ticks later', () => {
        const spells = spellWorld(testMob('player', { x: 2, y: 0, z: 0 }));
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.summon_entity': EVOKER_SPELLS },
            world: spells.world
        });

        spells.run(harness, 300);

        const fangs = spells.summoned.filter((entry) => entry.identifier === 'minecraft:evocation_fang');
        const firstCast = fangs.filter((fang) => fang.tick === fangs[0]?.tick);
        const inner = firstCast.filter((fang) => Math.abs(Math.hypot(fang.x, fang.z) - 1.5) < 1e-9);
        const outer = firstCast.filter((fang) => Math.abs(Math.hypot(fang.x, fang.z) - 2.5) < 1e-9);
        expect(inner).toHaveLength(5);
        expect(outer).toHaveLength(8);
        expect(inner.every((fang) => fang.warmup === 0)).toBe(true);
        expect(outer.every((fang) => fang.warmup === 3)).toBe(true);
        expect(inner[0]?.x).toBeCloseTo(1.5);
        expect(Math.atan2(outer[0]?.z ?? 0, outer[0]?.x ?? 0)).toBeCloseTo(Math.PI * 0.4);
    });

    it('casts fangs instead of vexes once as many vexes as its draw allows are near', () => {
        const vexes = Array.from({ length: 8 }, (_, index) =>
            testMob(`vex-${index}`, { x: 1, y: 0, z: 0 }, { identifier: 'minecraft:vex' })
        );
        const spells = spellWorld(testMob('player', { x: 8, y: 0, z: 0 }), vexes);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.summon_entity': EVOKER_SPELLS },
            world: spells.world,
            randomInt: (bound) => bound - 1
        });

        spells.run(harness, 60);

        expect(spells.summoned.some((entry) => entry.identifier === 'minecraft:vex')).toBe(false);
        expect(spells.summoned.filter((entry) => entry.identifier === 'minecraft:evocation_fang')).toHaveLength(16);
    });
});

describe('minecraft:behavior.send_event', () => {
    const wololo = {
        priority: 3,
        event_choices: [
            {
                cast_duration: 3,
                max_activation_range: 16,
                filters: { test: 'is_family', subject: 'other', value: 'sheep' },
                cooldown_time: 5,
                sequence: [{ base_delay: 2, event: 'wololo' }]
            }
        ]
    };

    it('fires its event on a mob its filter accepts, 40 ticks into the cast, when the caster has no target', () => {
        const sheep = testMob('sheep', { x: 5, y: 0, z: 0 }, { families: ['sheep'] });
        const spells = spellWorld(undefined, [testMob('cow', { x: 3, y: 0, z: 0 }, { families: ['cow'] }), sheep]);
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.send_event': wololo }, world: spells.world });

        spells.run(harness, 39);
        expect(spells.fired).toEqual([]);
        spells.run(harness, 1);
        expect(spells.fired).toEqual(['sheep wololo']);
    });

    it('casts nothing while the caster has a target', () => {
        const sheep = testMob('sheep', { x: 5, y: 0, z: 0 }, { families: ['sheep'] });
        const spells = spellWorld(testMob('player', { x: 8, y: 0, z: 0 }), [sheep]);
        const harness = new GoalHarness({ goals: { 'minecraft:behavior.send_event': wololo }, world: spells.world });

        spells.run(harness, 200);

        expect(spells.fired).toEqual([]);
    });
});
