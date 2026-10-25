import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';

/** The single-entity family: the dragon phases, the squid states and the timer flags. */

describe('the ender dragon phases', () => {
    it('hold the flags their phase needs', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.dragonholdingpattern': { priority: 2 },
                'minecraft:behavior.dragondeath': { priority: 0 }
            }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.dragondeath');
        expect(harness.holderOf('look')).toBe('minecraft:behavior.dragondeath');
        expect(harness.holderOf('jump')).toBe('minecraft:behavior.dragondeath');
    });

    it('let a lower-numbered phase preempt a running one', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.dragonholdingpattern': { priority: 2 },
                'minecraft:behavior.dragonscanning': { priority: 1 }
            }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.dragonscanning');
        expect(harness.isRunning('minecraft:behavior.dragonholdingpattern')).toBe(false);
    });
});

describe('the squid states', () => {
    it('only run in water', () => {
        const dry = new GoalHarness({
            goals: { 'minecraft:behavior.squid_idle': { priority: 2 } },
            flags: { in_water: false }
        });
        dry.tick();
        expect(dry.running()).toEqual([]);

        const wet = new GoalHarness({
            goals: { 'minecraft:behavior.squid_idle': { priority: 2 } },
            flags: { in_water: true }
        });
        wet.tick();
        expect(wet.holderOf('move')).toBe('minecraft:behavior.squid_idle');
    });

    it('flop a beached squid instead of pathing it', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.squid_out_of_water': { priority: 1 } },
            flags: { in_water: false },
            random: () => 0
        });

        harness.tick(3);

        expect(harness.actuator.count('jump')).toBe(3);
    });
});

/** The goal set and the components `entities/slime.json` carries, minus the targeting goals. */
const slimeHarness = (options: { readonly target?: ReturnType<typeof testMob> } = {}) =>
    new GoalHarness({
        identifier: 'minecraft:slime',
        goals: {
            'minecraft:behavior.slime_float': { priority: 1 },
            'minecraft:behavior.slime_attack': { priority: 3 },
            'minecraft:behavior.slime_random_direction': { priority: 4 },
            'minecraft:behavior.slime_keep_on_jumping': { priority: 5 }
        },
        components: { 'minecraft:movement': { value: 0.6 }, 'minecraft:navigation.walk': {} },
        flags: { on_ground: true },
        at: { x: 0, y: 64, z: 0 },
        world: options.target === undefined ? {} : { target: () => options.target }
    });

/** How far the slime is from where it started, ignoring height. */
const traveled = (harness: GoalHarness): number => Math.hypot(harness.actuator.at.x, harness.actuator.at.z);

describe('minecraft:behavior.slime_keep_on_jumping', () => {
    it('jumps whenever the slime is on the ground', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.slime_keep_on_jumping': { priority: 3 } },
            flags: { on_ground: true }
        });

        harness.tick(4);

        expect(harness.actuator.count('jump')).toBe(4);
        expect(harness.holderOf('jump')).toBe('minecraft:behavior.slime_keep_on_jumping');
    });

    it('carries the slime along the heading, because a jump in place is not a walk', () => {
        const harness = slimeHarness();

        harness.tick(200);

        expect(harness.actuator.count('jump')).toBeGreaterThan(0);
        expect(traveled(harness)).toBeGreaterThan(1);
    });

    it('hops toward the target rather than away from it', () => {
        const target = testMob('player', { x: 40, y: 64, z: 0 }, { families: ['player'] });
        const harness = slimeHarness({ target });

        harness.tick(200);

        expect(harness.actuator.at.x).toBeGreaterThan(4);
        expect(Math.abs(harness.actuator.at.z)).toBeLessThan(harness.actuator.at.x);
    });

    it('goes nowhere while the slime is in the air', () => {
        const harness = new GoalHarness({
            identifier: 'minecraft:slime',
            goals: {
                'minecraft:behavior.slime_random_direction': { priority: 4 },
                'minecraft:behavior.slime_keep_on_jumping': { priority: 5 }
            },
            components: { 'minecraft:movement': { value: 0.6 } },
            flags: { on_ground: false },
            at: { x: 0, y: 64, z: 0 }
        });

        harness.tick(200);

        expect(harness.actuator.count('jump')).toBe(0);
        expect(traveled(harness)).toBe(0);
    });
});

describe('minecraft:behavior.timer_flag_1', () => {
    it('raises the flag for duration_range and then waits out cooldown_range', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.timer_flag_1': {
                    priority: 7,
                    duration_range: [0.1, 0.1],
                    cooldown_range: [0.5, 0.5]
                }
            }
        });

        harness.tick();
        expect(harness.isRunning('minecraft:behavior.timer_flag_1')).toBe(true);

        harness.tick(3);
        expect(harness.isRunning('minecraft:behavior.timer_flag_1')).toBe(false);
    });

    it('takes the control flags the component names instead of its own', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.timer_flag_2': {
                    priority: 7,
                    control_flags: ['move'],
                    duration_range: [1, 1],
                    cooldown_range: [1, 1]
                }
            }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.timer_flag_2');
        expect(harness.holderOf('look')).toBeUndefined();
    });
});

describe('minecraft:behavior.skeleton_horse_trap', () => {
    it('springs when a player comes inside the radius', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.skeleton_horse_trap': { priority: 0, within_radius: 10, duration: 1 } },
            world: { players: () => [testMob('player', { x: 4, y: 0, z: 0 })] }
        });

        harness.tick();

        expect(harness.isRunning('minecraft:behavior.skeleton_horse_trap')).toBe(true);
    });

    it('stays armed while nobody is near', () => {
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.skeleton_horse_trap': { priority: 0, within_radius: 10 } },
            world: { players: () => [] }
        });

        harness.tick();

        expect(harness.running()).toEqual([]);
    });
});
