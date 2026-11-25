import { describe, expect, it } from 'vitest';

import { GoalHarness, testMob } from '../harness';
import { voxelGrid } from '../navigation/voxelGrid';
import type { GoalMob, GoalWorld } from '../world';
import { dragonPhaseState } from './dragonPhases';

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

    it('run the goal of the phase the dragon is in, not the one with the lowest priority number', () => {
        const harness = new GoalHarness({
            goals: {
                'minecraft:behavior.dragonholdingpattern': { priority: 2 },
                'minecraft:behavior.dragonscanning': { priority: 1 }
            }
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.dragonholdingpattern');
        expect(harness.isRunning('minecraft:behavior.dragonscanning')).toBe(false);
    });

    /** A dragon world on a flat floor at y 64, with a player at a fixed spot and a log of breath. */
    const dragonWorld = (harness: () => GoalHarness, player: GoalMob | undefined) => {
        let clock = 0;
        const clouds: { tick: number; x: number; y: number; z: number; data: unknown }[] = [];
        const discarded: (string | number)[] = [];
        const world: GoalWorld = {
            gameTime: () => clock,
            players: () => (player === undefined ? [] : [player]),
            seaLevel: () => 62,
            surfaceY: () => 64,
            fightOrigin: () => ({ x: 0, y: 64, z: 0 }),
            navigation: () => ({
                blockAt: (at) => (at.y < 64 ? 'minecraft:end_stone' : 'minecraft:air'),
                isPassable: (at) => at.y >= 64,
                isSolid: (at) => at.y < 64,
                isWater: () => false,
                isLava: () => false
            }),
            moveSelf: (position) => {
                harness().actuator.at = position;
            },
            spawn: (identifier, position, _event, options) => {
                clouds.push({ tick: clock, ...position, data: options?.data });
                return testMob(`${identifier}-${clouds.length}`, position, { identifier });
            },
            discard: (mob) => discarded.push(mob.id)
        };
        return {
            world,
            clouds,
            discarded,
            run: (ticks: number) => {
                for (let index = 0; index < ticks; index += 1) {
                    clock += 1;
                    harness().tick();
                }
            }
        };
    };

    const SITTING = {
        'minecraft:behavior.dragonlanding': { priority: 0 },
        'minecraft:behavior.dragonflaming': { priority: 1 },
        'minecraft:behavior.dragonscanning': { priority: 2 }
    };

    it('scan for 25 ticks, roar for 40, breathe on the 10th tick of the flame and take the breath back at 200', () => {
        let harness: GoalHarness | undefined;
        const dragon = dragonWorld(
            () => {
                if (harness === undefined) throw new Error('no harness yet');
                return harness;
            },
            testMob('player', { x: 0, y: 64, z: 12 })
        );
        harness = new GoalHarness({ goals: SITTING, world: dragon.world, at: { x: 0, y: 64, z: 0 } });
        harness.entity.componentState.set(dragonPhaseState, {
            phase: 'sitting_scanning',
            flameCount: 0,
            chargeTarget: null
        });
        const phase = () => harness?.entity.componentState.get(dragonPhaseState)?.phase;

        dragon.run(25);
        expect(phase()).toBe('sitting_scanning');
        dragon.run(1);
        expect(phase()).toBe('sitting_attacking');
        dragon.run(41);
        expect(phase()).toBe('sitting_flaming');
        dragon.run(10);
        expect(dragon.clouds).toHaveLength(1);
        const [cloud] = dragon.clouds;
        expect(cloud?.y).toBe(64);
        expect(Math.hypot(cloud?.x ?? 0, cloud?.z ?? 0)).toBeCloseTo(9, 0);
        expect(cloud?.data).toMatchObject({ radius: 5, duration: 200, potion_duration_scale: 0.25 });
        dragon.run(190);
        expect(phase()).toBe('sitting_scanning');
        expect(dragon.discarded).toEqual(['minecraft:area_effect_cloud-1']);
    });

    it('take off once a sitting dragon has lost a quarter of its health', () => {
        let harness: GoalHarness | undefined;
        const dragon = dragonWorld(
            () => {
                if (harness === undefined) throw new Error('no harness yet');
                return harness;
            },
            testMob('player', { x: 0, y: 64, z: 12 })
        );
        harness = new GoalHarness({
            goals: SITTING,
            components: { 'minecraft:health': { value: 200, max: 200 } },
            world: dragon.world,
            at: { x: 0, y: 64, z: 0 }
        });
        harness.entity.componentState.set(dragonPhaseState, {
            phase: 'sitting_scanning',
            flameCount: 0,
            chargeTarget: null
        });
        const phase = () => harness?.entity.componentState.get(dragonPhaseState)?.phase;
        dragon.run(2);

        harness.entity.attributes.set('health', 160);
        dragon.run(2);
        expect(phase()).toBe('sitting_scanning');
        harness.entity.attributes.set('health', 149);
        dragon.run(2);
        expect(phase()).toBe('takeoff');
    });

    /** A dragon in its holding pattern at (0, 80, 0) among some mobs and blocks, logging what it does to them. */
    const contactWorld = (options: {
        readonly mobs: readonly GoalMob[];
        readonly blocks?: Readonly<Record<string, string>>;
        readonly griefing?: boolean;
    }) => {
        let clock = 0;
        const pushes: { id: string | number; x: number; y: number; z: number }[] = [];
        const blows: { id: string | number; damage: number | undefined }[] = [];
        const blocks = new Map(Object.entries(options.blocks ?? {}));
        const key = (at: { x: number; y: number; z: number }) => `${at.x},${at.y},${at.z}`;
        let harness: GoalHarness | undefined;
        const world: GoalWorld = {
            gameTime: () => clock,
            players: () => [],
            mobs: () => options.mobs,
            fightOrigin: () => ({ x: 0, y: 64, z: 0 }),
            surfaceY: () => 64,
            gameRule: (name) => (name === 'mobGriefing' ? (options.griefing ?? true) : undefined),
            moveSelf: (position) => {
                if (harness !== undefined) harness.actuator.at = position;
            },
            pushMob: (mob, velocity) => pushes.push({ id: mob.id, ...velocity }),
            attack: (mob, damage) => blows.push({ id: mob.id, damage }),
            blockAt: (at) => {
                const identifier = blocks.get(key(at));
                return identifier === undefined ? undefined : { identifier, states: {} };
            },
            setBlock: (at, identifier) => {
                blocks.set(key(at), identifier);
            },
            blockHasTag: (at, tag) =>
                tag === 'minecraft:dragon_immune' &&
                ['minecraft:end_stone', 'minecraft:obsidian'].includes(blocks.get(key(at)) ?? '')
        };
        harness = new GoalHarness({
            goals: { 'minecraft:behavior.dragonholdingpattern': { priority: 2 } },
            components: { 'minecraft:health': { value: 200, max: 200 } },
            world,
            at: { x: 0, y: 80, z: 0 }
        });
        const dragon = harness;
        return {
            dragon,
            pushes,
            blows,
            blocks,
            run: (ticks: number) => {
                for (let index = 0; index < ticks; index += 1) {
                    clock += 1;
                    dragon.tick();
                }
            }
        };
    };

    it("shove what their wings meet and bite what their head touches, as Java's aiStep does", () => {
        // A dragon at yRot 0 reaches east and west with its wings and north with its head.
        const beside = testMob('beside', { x: 5, y: 80, z: 0 }, { health: 100 });
        const ahead = testMob('ahead', { x: 0, y: 80, z: -6.5 }, { health: 100 });
        const far = testMob('far', { x: 0, y: 80, z: 15 }, { health: 100 });
        const contact = contactWorld({ mobs: [beside, ahead, far] });

        contact.run(1);

        const [shove] = contact.pushes.filter((push) => push.id === 'beside');
        expect(shove?.x).toBeGreaterThan(0);
        expect(shove?.y).toBe(0.2);
        expect(contact.blows).toEqual(
            expect.arrayContaining([
                { id: 'beside', damage: 5 },
                { id: 'ahead', damage: 10 }
            ])
        );
        expect(contact.blows.some((blow) => blow.id === 'far')).toBe(false);
    });

    it('leave others alone for the 10 ticks after the dragon is hurt', () => {
        const beside = testMob('beside', { x: 5, y: 80, z: 0 }, { health: 100 });
        const contact = contactWorld({ mobs: [beside] });
        contact.run(1);
        contact.dragon.entity.attributes.set('health', 190);
        contact.blows.length = 0;
        contact.pushes.length = 0;

        contact.run(9);
        expect(contact.blows).toEqual([]);
        expect(contact.pushes).toEqual([]);
        contact.run(2);
        expect(contact.blows.length).toBeGreaterThan(0);
    });

    it('break the blocks the body flies through, but the dragon-immune ones, only with mobGriefing on', () => {
        const blocks = { '1,81,0': 'minecraft:stone', '-1,81,0': 'minecraft:end_stone' };
        const griefing = contactWorld({ mobs: [], blocks });
        griefing.run(1);
        expect(griefing.blocks.get('1,81,0')).toBe('minecraft:air');
        expect(griefing.blocks.get('-1,81,0')).toBe('minecraft:end_stone');

        const tame = contactWorld({ mobs: [], blocks, griefing: false });
        tame.run(1);
        expect(tame.blocks.get('1,81,0')).toBe('minecraft:stone');
    });

    it('land on the portal from the approach and start scanning there', () => {
        let harness: GoalHarness | undefined;
        const dragon = dragonWorld(() => {
            if (harness === undefined) throw new Error('no harness yet');
            return harness;
        }, undefined);
        harness = new GoalHarness({ goals: SITTING, world: dragon.world, at: { x: 30, y: 90, z: 0 } });
        harness.entity.componentState.set(dragonPhaseState, {
            phase: 'landing_approach',
            flameCount: 0,
            chargeTarget: null
        });

        const phase = () => harness?.entity.componentState.get(dragonPhaseState)?.phase;
        let ticks = 0;
        while (phase() !== 'sitting_scanning' && ticks < 600) {
            dragon.run(1);
            ticks += 1;
        }

        const here = harness.actuator.at;
        expect(phase()).toBe('sitting_scanning');
        expect(Math.hypot(here.x - 0.5, here.y - 64, here.z - 0.5)).toBeLessThan(1);
        // With nobody within 20 blocks, Java's scan gives up after 100 ticks and takes off.
        dragon.run(100);
        expect(phase()).toBe('takeoff');
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

describe('minecraft:behavior.slime_random_direction', () => {
    it("leaves the turn to the move control, as Java's goal only sets its direction", () => {
        const harness = new GoalHarness({
            identifier: 'minecraft:slime',
            goals: { 'minecraft:behavior.slime_random_direction': { priority: 4 } },
            flags: { on_ground: true }
        });

        harness.tick(40);

        expect(harness.actuator.count('lookAt')).toBe(0);
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
    /** A trap world that records every spawn and who each spawn was told to ride. */
    const trapWorld = (players: () => readonly GoalMob[]) => {
        let clock = 0;
        const spawned: {
            identifier: string;
            event: string | undefined;
            rides: string | number | undefined;
            head: string | undefined;
            visual: unknown;
        }[] = [];
        let removed = false;
        const world: GoalWorld = {
            players,
            gameTime: () => clock,
            self: () => testMob('trap', { x: 0, y: 0, z: 0 }),
            removeSelf: () => {
                removed = true;
            },
            spawn: (identifier, position, event, options) => {
                spawned.push({
                    identifier,
                    event,
                    rides: options?.rides?.id,
                    head: options?.fillEmptySlots?.['head'],
                    visual: options?.data?.['visual_only']
                });
                return testMob(`${identifier}-${spawned.length}`, position, { identifier });
            }
        };
        return {
            world,
            spawned,
            removed: () => removed,
            run: (harness: GoalHarness, ticks: number) => {
                for (let index = 0; index < ticks; index += 1) {
                    clock += 1;
                    harness.tick();
                }
            }
        };
    };

    it("springs once, with a visual bolt, a skeleton on the trap horse and Java's three horsemen", () => {
        const trap = trapWorld(() => [testMob('player', { x: 4, y: 0, z: 0 })]);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.skeleton_horse_trap': { priority: 0, within_radius: 10, duration: 900 } },
            world: trap.world
        });

        trap.run(harness, 40);

        expect(trap.spawned.filter((entry) => entry.identifier === 'minecraft:lightning_bolt')).toEqual([
            {
                identifier: 'minecraft:lightning_bolt',
                event: undefined,
                rides: undefined,
                head: undefined,
                visual: true
            }
        ]);
        const horses = trap.spawned.filter((entry) => entry.identifier === 'minecraft:skeleton_horse');
        expect(horses.map((horse) => horse.event)).toEqual(Array(3).fill('minecraft:spring_trap'));
        const skeletons = trap.spawned.filter((entry) => entry.identifier === 'minecraft:skeleton');
        expect(skeletons.map((skeleton) => skeleton.rides)).toEqual([
            'trap',
            ...trap.spawned.flatMap((entry, index) =>
                entry.identifier === 'minecraft:skeleton_horse' ? [`minecraft:skeleton_horse-${index + 1}`] : []
            )
        ]);
        expect(skeletons.every((skeleton) => skeleton.head === 'minecraft:iron_helmet')).toBe(true);
    });

    it('stays armed while nobody is near, and takes the horse away once its duration runs out', () => {
        const trap = trapWorld(() => []);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.skeleton_horse_trap': { priority: 0, within_radius: 10, duration: 5 } },
            world: trap.world
        });

        trap.run(harness, 50);
        expect(trap.spawned).toEqual([]);
        expect(trap.removed()).toBe(false);

        trap.run(harness, 60);
        expect(trap.removed()).toBe(true);
    });
});

describe('the silverfish goals', () => {
    it('hide a silverfish in a cobblestone face neighbor as infested cobblestone', () => {
        const writes: string[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.silverfish_merge_with_stone': { priority: 5 } },
            world: {
                blocks: () => [{ position: { x: 0, y: -1, z: 0 }, identifier: 'minecraft:cobblestone' }],
                setBlock: (_position, identifier) => writes.push(identifier)
            },
            at: { x: 0.5, y: 0, z: 0.5 },
            // The first draw passes the one-in-five check, the second picks the face below.
            randomInt: () => 0
        });

        harness.tick();

        expect(writes).toEqual(['minecraft:infested_cobblestone']);
    });

    it('leave a block that cannot host a silverfish alone', () => {
        const writes: string[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.silverfish_merge_with_stone': { priority: 5 } },
            world: {
                blocks: (query) =>
                    query.identifiers?.includes('minecraft:dirt') === true
                        ? [{ position: { x: 0, y: -1, z: 0 }, identifier: 'minecraft:dirt' }]
                        : [],
                setBlock: (_position, identifier) => writes.push(identifier)
            },
            at: { x: 0.5, y: 0, z: 0.5 },
            randomInt: () => 0
        });

        harness.tick(10);

        expect(writes).toEqual([]);
    });

    it('wander when no face neighbor can host a silverfish, as the stroll the Java goal extends', () => {
        let draw = 0;
        const floor = Array.from({ length: 16 }, () => '#'.repeat(16));
        const air = Array.from({ length: 16 }, () => '.'.repeat(16));
        const view = voxelGrid([floor, air, air]);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.silverfish_merge_with_stone': { priority: 5 } },
            components: { 'minecraft:collision_box': { width: 0.4, height: 0.3 }, 'minecraft:navigation.walk': {} },
            world: { navigation: () => view, blocks: () => [] },
            at: { x: 8.5, y: 1, z: 8.5 },
            // The one-in-five checks pass, and the stroll draws a spot four blocks south east,
            // in the silverfish's own layer.
            randomInt: () => 0,
            random: () => [0.7, 0.5, 0.7][draw++ % 3] ?? 0.5
        });

        harness.tick();

        expect(harness.holderOf('move')).toBe('minecraft:behavior.silverfish_merge_with_stone');
        expect(harness.actuator.count('moveTo')).toBeGreaterThan(0);
    });

    it('still wander with mobGriefing off, which only stops the hiding', () => {
        let draw = 0;
        const writes: string[] = [];
        const floor = Array.from({ length: 16 }, () => '#'.repeat(16));
        const air = Array.from({ length: 16 }, () => '.'.repeat(16));
        const view = voxelGrid([floor, air, air]);
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.silverfish_merge_with_stone': { priority: 5 } },
            components: { 'minecraft:collision_box': { width: 0.4, height: 0.3 }, 'minecraft:navigation.walk': {} },
            world: {
                navigation: () => view,
                gameRule: (name) => name !== 'mobGriefing',
                blocks: () => [{ position: { x: 8, y: 0, z: 8 }, identifier: 'minecraft:stone' }],
                setBlock: (_position, identifier) => writes.push(identifier)
            },
            at: { x: 8.5, y: 1, z: 8.5 },
            // The one-in-five checks pass, and the stroll draws a spot four blocks south east,
            // in the silverfish's own layer.
            randomInt: () => 0,
            random: () => [0.7, 0.5, 0.7][draw++ % 3] ?? 0.5
        });

        harness.tick();

        expect(writes).toEqual([]);
        expect(harness.actuator.count('moveTo')).toBeGreaterThan(0);
    });

    it('wake the nests 20 ticks after the blow, not before', () => {
        const broken: number[] = [];
        let tick = 0;
        let damagers: readonly { mob: ReturnType<typeof testMob>; cause: string; total: number }[] = [];
        const harness = new GoalHarness({
            goals: { 'minecraft:behavior.silverfish_wake_up_friends': { priority: 1 } },
            world: {
                damagers: () => damagers,
                blocks: () => [{ position: { x: 3, y: 0, z: 0 }, identifier: 'minecraft:infested_stone' }],
                breakBlock: () => broken.push(tick),
                spawn: () => undefined
            },
            at: { x: 0.5, y: 0, z: 0.5 }
        });

        harness.tick();
        damagers = [{ mob: testMob('player', { x: 2, y: 0, z: 0 }), cause: 'entity_attack', total: 1 }];
        for (tick = 1; tick <= 30; tick += 1) harness.tick();

        expect(broken).toEqual([20]);
    });
});
