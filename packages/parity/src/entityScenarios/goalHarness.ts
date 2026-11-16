import type {
    EntityFlag,
    EntityInstance,
    EntityMeasure,
    EntityPosition,
    FilterWorldView
} from '@jsprismarine/entities';
import { EntityTypes } from '@jsprismarine/entities';
import { RecordingActuator } from '@jsprismarine/entity-goals/harness';
import { createGoalEntityRegistry } from '@jsprismarine/entity-goals/register';
import type { GoalWorld } from '@jsprismarine/entity-goals/world';

import { isRecord } from '../isRecord.ts';
import { realStack, serverContent } from '../serverStack.ts';
import { field } from './subjects.ts';

/**
 * Drives one of the server's goals, as the server's entity definition declares it, through the
 * real goal implementation and scheduler in `@jsprismarine/entity-goals`, and reports what it
 * decided: whether it started, how long it ran, what it asked the world for and how fast it walked.
 *
 * The goal runs on a bare entity whose only component is that goal, so what it decides comes from
 * the goal's own parameters and code, which is what a Java goal's constructor arguments compare with.
 */

/** What a probe sets up around the goal. */
export interface ProbeSetup {
    /** The world seam the goal reads; every member left out answers nothing. */
    readonly world?: GoalWorld;
    /** The entity's own facts, such as `in_water`. */
    readonly flags?: Partial<Record<EntityFlag, boolean>>;
    /** The entity's own measures, such as `owner_distance`. */
    readonly measures?: Partial<Record<EntityMeasure, number>>;
    /** The world facts a filter reads, such as the time of day. */
    readonly worldFacts?: FilterWorldView;
    /** Every random draw, in [0, 1). A constant makes a chance either always or never pass. */
    readonly random?: () => number;
    /** Every bounded integer draw; defaults to scaling `random`. */
    readonly randomInt?: (bound: number) => number;
    /** Where the entity stands. */
    readonly at?: EntityPosition;
    /** Where a wander asks to go, when the goal draws a random position. */
    readonly wander?: EntityPosition;
    /**
     * Other components the entity carries beside the goal, such as `minecraft:is_baby`, whose
     * presence is the entity's own state, or `minecraft:shareables`, which a goal reads.
     */
    readonly components?: Readonly<Record<string, unknown>>;
    /** Whether a walk request moves the entity there at once; false leaves it standing. */
    readonly follow?: boolean;
}

/** A goal on a bare entity, ready to tick. */
export interface GoalProbe {
    readonly entity: EntityInstance;
    /** What the goal asked the entity to do. */
    readonly actuator: RecordingActuator;
    /** Whether the goal is running now. */
    isRunning(component: string): boolean;
}

/** The identifier the probe entity spawns under, which a goal compares a same-type mob against. */
export const PROBE_IDENTIFIER = 'parity:goal_probe';

/** The world the entity being spawned reads; a goal resolves its world while the entity is built. */
let spawningWorld: GoalWorld = {};
let probeRegistry: ReturnType<typeof createGoalEntityRegistry> | undefined;
const probeTypes = new Map<string, EntityTypes>();

/** The entity table holding one goal body on the probe entity, loaded once per body. */
const typesFor = (component: string, body: unknown, components: Readonly<Record<string, unknown>>): EntityTypes => {
    const key = `${component}\u0000${JSON.stringify(body)}\u0000${JSON.stringify(components)}`;
    const cached = probeTypes.get(key);
    if (cached !== undefined) return cached;
    probeRegistry ??= createGoalEntityRegistry({ world: () => spawningWorld });
    const types = new EntityTypes({ components: probeRegistry });
    const errors = types
        .load([
            {
                data: {
                    format_version: '1.21.0',
                    'minecraft:entity': {
                        description: { identifier: PROBE_IDENTIFIER, is_spawnable: true, is_summonable: true },
                        components: { ...components, [component]: body }
                    }
                },
                pack: 'parity',
                path: 'entities/goal_probe.json'
            }
        ])
        .filter((entry) => entry.severity === 'error');
    if (errors.length > 0) throw new Error(errors.map((entry) => entry.message).join('; '));
    probeTypes.set(key, types);
    return types;
};

/** Puts one goal body on a bare entity with the given surroundings. */
export const probeGoal = (component: string, body: unknown, setup: ProbeSetup = {}): GoalProbe => {
    const actuator = new RecordingActuator(setup.at ?? { x: 0, y: 0, z: 0 });
    actuator.wander = setup.wander ?? { x: 6, y: 0, z: 6 };
    actuator.follow = setup.follow ?? true;
    const next = setup.random ?? (() => 0.5);
    spawningWorld = setup.world ?? {};
    const entity = typesFor(component, body, setup.components ?? {}).spawn(PROBE_IDENTIFIER, {
        environment: {
            actuator,
            random: { next, nextInt: setup.randomInt ?? ((bound) => Math.floor(next() * bound)) },
            filterContext: () => ({
                self: {
                    flag: (name) => setup.flags?.[name],
                    measure: (name) => setup.measures?.[name]
                },
                ...(setup.worldFacts === undefined ? {} : { world: setup.worldFacts })
            })
        }
    });
    spawningWorld = {};
    return {
        entity,
        actuator,
        isRunning: (name) => entity.goals.runningGoals().includes(name)
    };
};

/**
 * Advances a probe by game ticks, running the goal selector on every other tick and only the
 * every-tick goals between, the cadence Java's `Mob.serverAiStep` and the server both keep.
 */
export const gameTicks = (harness: GoalProbe, ticks: number): void => {
    for (let tick = 0; tick < ticks; tick++) harness.entity.goals.tick(tick % 2 === 0);
};

/** Whether the goal starts within one selector tick when every random draw is `draw`. */
export const startsAt = (component: string, body: unknown, setup: ProbeSetup, draw: number): boolean => {
    const harness = probeGoal(component, body, { ...setup, random: () => draw });
    gameTicks(harness, 1);
    return harness.isRunning(component);
};

/**
 * The chance per selector tick at which a goal starts: the largest constant draw that still
 * starts it, found by bisection, or 1 when every draw does and 0 when none does.
 */
export const startChance = (component: string, body: unknown, setup: ProbeSetup = {}): number => {
    if (startsAt(component, body, setup, 1 - 1e-9)) return 1;
    if (!startsAt(component, body, setup, 0)) return 0;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 30; step++) {
        const middle = (low + high) / 2;
        if (startsAt(component, body, setup, middle)) low = middle;
        else high = middle;
    }
    return high;
};

/**
 * How many game ticks a goal runs once started, counting from the tick it starts until the first
 * tick it is no longer running.
 *
 * The goal's first `before` draws are 0, so its start chance passes; the next is `draw`, which
 * is the one its hold time takes; every later draw is just under 1, so the goal does not start
 * again on the tick it stops.
 */
export const runTicks = (
    component: string,
    body: unknown,
    setup: ProbeSetup,
    before: number,
    draw: number,
    limit = 2000
): number => {
    let draws = 0;
    const next = (): number => {
        const index = draws++;
        return index < before ? 0 : index === before ? draw : 1 - 1e-9;
    };
    const harness = probeGoal(component, body, {
        ...setup,
        random: next,
        randomInt: (bound) => Math.min(bound - 1, Math.floor(next() * bound))
    });
    gameTicks(harness, 1);
    if (!harness.isRunning(component)) return 0;
    let ticks = 1;
    for (; ticks < limit; ticks++) {
        harness.entity.goals.tick(ticks % 2 === 0);
        if (!harness.isRunning(component)) break;
    }
    return ticks;
};

/** The speed multipliers a probe's walks asked for, in order. */
export const walkSpeeds = (harness: GoalProbe): readonly number[] =>
    harness.actuator.log.flatMap((entry) => {
        const match = entry.match(/^moveTo .* @(.+)$/);
        return match?.[1] === undefined ? [] : [Number(match[1])];
    });

/** One declaration of a goal, with the walking speed the entity has in the same state. */
export interface DeclaredGoal {
    readonly body: unknown;
    /** The `minecraft:movement` value of the component group the body is in, else the base one. */
    readonly movement: number | undefined;
}

const movementOf = (components: unknown): number | undefined => {
    const value = field(field(components, 'minecraft:movement'), 'value');
    return typeof value === 'number' && value > 0 ? value : undefined;
};

/**
 * Every body a Bedrock entity definition declares for a goal, in its base components and each
 * component group, each with the walking speed a goal's speed multiplier scales in that state.
 */
export const declaredGoals = (bedrock: string, component: string): readonly DeclaredGoal[] => {
    const data = serverContent().definitions.entities.get(bedrock)?.data;
    const entity = field(data, 'minecraft:entity');
    const body = isRecord(field(entity, 'minecraft:entity')) ? field(entity, 'minecraft:entity') : entity;
    const base = field(body, 'components');
    const groups = field(body, 'component_groups');
    const groupList = isRecord(groups) ? Object.values(groups) : [];
    // A definition that writes its speed only in component groups, such as the adult and baby
    // zombie, walks at the first group's speed in a state whose own section names none.
    const baseMovement =
        movementOf(base) ??
        groupList.map(movementOf).find((value) => value !== undefined) ??
        realStack().runtime.typeFacts().get(bedrock)?.movement;
    const found: DeclaredGoal[] = [];
    const declared = field(base, component);
    if (declared !== undefined) found.push({ body: declared, movement: baseMovement });
    for (const group of groupList) {
        const value = field(group, component);
        if (value !== undefined) found.push({ body: value, movement: movementOf(group) ?? baseMovement });
    }
    return found;
};
