import { describe, expect, it } from 'vitest';

import type { EntityActuator } from '@jsprismarine/entities';
import { EntityTypes } from '@jsprismarine/entities';
import type { GoalWorld } from '@jsprismarine/entity-goals';
import { createGoalEntityRegistry, goalNames } from '@jsprismarine/entity-goals';

import { actuatorOf, goalWorldOf } from './goalWorld';
import { entityFixture, entityFile, FLOOR_Y, TestEntityWorld } from './testing';

/**
 * How many of the 170 vanilla goals can run against the real host.
 *
 * A goal that reaches for a `GoalWorld` member the server leaves out gets
 * undefined and stops, so the measure is simple: drive every goal, record
 * every member it touched, and count the goals whose every touch was
 * answered. Before the host implemented the other 21 members, 118 of the 170
 * passed this and 52 did not.
 *
 * The count is the regression guard. `goalWorldOf` returns
 * `Required<GoalWorld>`, so dropping a member stops the build, but a member
 * answered with undefined at runtime would not, and this is what catches
 * that.
 */

/** The cell above the fixture's stone floor. */
const groundAt = (x: number, z: number) => ({ x, y: FLOOR_Y + 1, z });

/** The components a carrier needs to stand up, walk and notice things. */
const CARRIER_COMPONENTS = {
    'minecraft:health': { value: 20, max: 20 },
    'minecraft:attack': { damage: 3 },
    'minecraft:movement': { value: 10 },
    'minecraft:follow_range': { value: 24 },
    'minecraft:collision_box': { width: 0.6, height: 1.8 },
    'minecraft:navigation.walk': { can_walk: true },
    'minecraft:type_family': { family: ['mob'] },
    'minecraft:inventory': { inventory_size: 5 },
    'minecraft:breedable': { require_tame: false },
    'minecraft:rideable': { seat_count: 2 },
    'minecraft:shooter': { def: 'minecraft:cow' }
};

/** How many ticks each goal gets to reach past its first condition. */
const TICKS_PER_GOAL = 20;

/**
 * A world with something in it for every goal to find.
 *
 * A goal that finds nothing still reads the member it would have found it
 * through, which is what the measure is about, but a world with a player, a
 * mate, a target, an item and a bed in it drives the goals further in and so
 * reads more members.
 */
const populatedFixture = () => {
    const world = new TestEntityWorld({
        players: [{ id: 900, identifier: 'minecraft:player', position: groundAt(3, 0) }],
        dayTime: 15000
    });
    world.setBlock({ x: 5, y: FLOOR_Y, z: 0 }, 'minecraft:bed');
    world.setBlock({ x: 4, y: FLOOR_Y + 1, z: 2 }, 'minecraft:redstone_lamp');

    const fixture = entityFixture(world);
    world.dropItem({ x: 1, y: FLOOR_Y + 1, z: 0 }, { identifier: 'minecraft:wheat', count: 1 });
    fixture.runtime.recordPointOfInterest('suspicious_location', groundAt(6, 6));
    fixture.runtime.recordPointOfInterest('buried_treasure', groundAt(8, 8));
    return fixture;
};

/** Everything one goal asked the world for, and what the host answered with. */
interface GoalReads {
    /** The members the goal touched. */
    readonly touched: readonly string[];
    /** The members it touched that the host does not answer. */
    readonly unanswered: readonly string[];
}

/** The identifier of the carrier built for one goal. */
const carrierFor = (name: string): string => `jsprismarine:carries_${name.replace(/\W/g, '_')}`;

/**
 * Drives all 170 goals against the real host and records what each reached
 * for.
 *
 * The carriers are built straight from `EntityTypes` rather than from the
 * runtime, because the measure needs a world object it can watch. The world
 * itself is the real one, over a real body in the real runtime. One registry
 * and one load serve all 170, with the watched world swapped between them,
 * because registering 170 goals 170 times takes longer than the measurement.
 */
const driveEveryGoal = (
    host: Required<GoalWorld>,
    actuator: EntityActuator,
    answered: ReadonlySet<string>
): ReadonlyMap<string, GoalReads> => {
    let touched = new Set<string>();
    const probe = new Proxy(host, {
        get: (target, key, receiver) => {
            if (typeof key === 'string') touched.add(key);
            return Reflect.get(target, key, receiver);
        }
    });

    const types = new EntityTypes({ components: createGoalEntityRegistry({ world: () => probe }) });
    const diagnostics = types.load(
        goalNames.map((name) => ({
            data: entityFile(carrierFor(name), {
                components: { ...CARRIER_COMPONENTS, [name]: { priority: 1 } }
            }),
            pack: 'goal-coverage',
            path: `entities/${carrierFor(name)}.json`
        }))
    );
    const errors = diagnostics.filter((entry) => entry.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map((entry) => entry.message).join('; '));

    const reads = new Map<string, GoalReads>();
    for (const name of goalNames) {
        touched = new Set<string>();
        const carrier = types.spawn(carrierFor(name), {
            environment: { actuator, random: { next: () => 0.5 } }
        });
        for (let tick = 0; tick < TICKS_PER_GOAL; tick += 1) carrier.goals.tick();
        reads.set(name, {
            touched: [...touched],
            unanswered: [...touched].filter((member) => !answered.has(member))
        });
    }
    return reads;
};

describe('the goals against the real goal world', () => {
    const fixture = populatedFixture();
    const carrier = fixture.runtime.spawn('minecraft:cow', groundAt(0, 0));
    const mate = fixture.runtime.spawn('minecraft:cow', groundAt(2, 0));
    if (carrier === undefined || mate === undefined) throw new Error('the fixture declares no minecraft:cow');

    carrier.target = mate.id;
    carrier.body.owner = 900;
    carrier.body.inventory.push('minecraft:wheat');
    fixture.runtime.hurt(carrier, mate.id, 'entity_attack', 1);
    fixture.runtime.knockback(
        mate.body,
        { id: carrier.id, position: () => carrier.position, view: () => ({}) },
        0.1,
        0
    );

    const host = goalWorldOf(carrier.body, fixture.runtime);
    const actuator = actuatorOf(carrier.body, fixture.runtime);

    /** Every member the host answers with a function of its own. */
    const answered = new Set(
        Object.entries(host)
            .filter(([, value]) => typeof value === 'function')
            .map(([member]) => member)
    );

    const reads = driveEveryGoal(host, actuator, answered);

    it('answers every member the 170 goals reach for', () => {
        const blocked = [...reads].filter(([, read]) => read.unanswered.length > 0);

        expect(Object.fromEntries(blocked.map(([name, read]) => [name, read.unanswered]))).toEqual({});
    });

    it('lets all 170 of them run', () => {
        const startable = [...reads].filter(([, read]) => read.unanswered.length === 0);

        expect(startable).toHaveLength(170);
        expect(goalNames).toHaveLength(170);
    });

    it('is reached for widely enough that the count means something', () => {
        const reached = new Set([...reads.values()].flatMap((read) => read.touched));

        // Driving the inventory touches 30 of the seam's members, 15 of them ones this host
        // used to leave out, which is what makes the count above a measure of the host
        // rather than of nothing. The six it does not reach - `mount`, `dismount`,
        // `breedWith`, `setSitting`, `openTrade` and `explode` - need a goal to arrive
        // somewhere or a roll to come up, and `goalWorld.test.ts` drives each of those.
        expect(reached.size).toBeGreaterThanOrEqual(30);
        expect([...reached].filter((member) => !answered.has(member))).toEqual([]);
    });

    it('answers every member of the seam with a function, none with undefined', () => {
        const absent = Object.entries(host)
            .filter(([, value]) => typeof value !== 'function')
            .map(([member]) => member);

        expect(absent).toEqual([]);
    });
});
