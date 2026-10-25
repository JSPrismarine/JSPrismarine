import type {
    EntityActuator,
    EntityFlag,
    EntityInstance,
    EntityPosition,
    FilterContext,
    FilterEntityView,
    FilterWorldView
} from '@jsprismarine/entities';
import { EntityTypes } from '@jsprismarine/entities';

import type { ControlFlag } from '@jsprismarine/entities';
import { createGoalEntityRegistry } from './register';
import type { GoalMob, GoalWorld } from './world';

/**
 * Typed doubles for the two seams the goals run against, and a harness that
 * puts a real entity behind them.
 *
 * The package's own tests use these, and a server integrating it can use the
 * same doubles to check its implementation of `EntityActuator` and
 * {@link GoalWorld} against the behavior the goals expect.
 */

/** An actuator that records what the goals asked it to do. */
export class RecordingActuator implements EntityActuator {
    /** Every call, in order, as `moveTo 1,2,3 @1.25` and the like. */
    public readonly log: string[] = [];

    /** Where the entity stands; a test moves it by assigning to this. */
    public at: EntityPosition;

    /** What {@link RecordingActuator.randomTarget} hands back, or undefined for none. */
    public wander: EntityPosition | undefined;

    /** What {@link RecordingActuator.nearestPlayer} hands back. */
    public player: EntityPosition | undefined;

    /**
     * Whether a walk request moves the entity there at once.
     *
     * A real server moves the entity over several ticks; the double jumps it,
     * so a goal that waits for arrival finishes in the next tick instead of
     * in forty. Set it to false to watch a goal that is going nowhere.
     */
    public follow = true;

    public constructor(at: EntityPosition = { x: 0, y: 0, z: 0 }) {
        this.at = at;
    }

    /** Where the entity is now. */
    public position(): EntityPosition {
        return this.at;
    }

    /** Records a walk request. */
    public moveTo(position: EntityPosition, speedMultiplier: number): void {
        this.log.push(`moveTo ${format(position)} @${speedMultiplier}`);
        if (this.follow) this.at = position;
    }

    /** Records that the path was abandoned. */
    public stopMoving(): void {
        this.log.push('stopMoving');
    }

    /** Records a look request. */
    public lookAt(position: EntityPosition): void {
        this.log.push(`lookAt ${format(position)}`);
    }

    /** Records a jump. */
    public jump(): void {
        this.log.push('jump');
    }

    /** Hands back {@link RecordingActuator.wander}. */
    public randomTarget(): EntityPosition | undefined {
        return this.wander;
    }

    /** Hands back {@link RecordingActuator.player}. */
    public nearestPlayer(): EntityPosition | undefined {
        return this.player;
    }

    /** How many times a call of this shape was made. */
    public count(prefix: string): number {
        return this.log.filter((entry) => entry.startsWith(prefix)).length;
    }
}

const format = (position: EntityPosition): string => `${round(position.x)},${round(position.y)},${round(position.z)}`;

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A small seeded generator, so a test that needs varied draws still repeats.
 *
 * It is the 32-bit `mulberry32` mixer, which is enough for picking wander
 * targets and rolling chances.
 */
export const seededRandom = (seed = 1): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

/** Options for {@link testMob}. */
export interface TestMobOptions {
    readonly identifier?: string;
    readonly heldItem?: string;
    readonly health?: number;
    readonly families?: readonly string[];
    readonly flags?: Partial<Record<EntityFlag, boolean>>;
    readonly target?: GoalMob;
    readonly lastDamager?: GoalMob;
}

/** Builds one {@link GoalMob} for a test, with only the facts the test needs. */
export const testMob = (id: string, at: EntityPosition, options: TestMobOptions = {}): GoalMob => ({
    id,
    position: () => at,
    view: (): FilterEntityView => ({
        id: () => id,
        flag: (name) => options.flags?.[name],
        names: (name) => (name === 'is_family' ? (options.families ?? []) : undefined)
    }),
    identifier: () => options.identifier,
    heldItem: () => options.heldItem,
    health: () => options.health,
    target: () => options.target,
    lastDamager: () => options.lastDamager
});

/** Options for a {@link GoalHarness}. */
export interface GoalHarnessOptions {
    /** The `minecraft:behavior.*` components to put on the entity, with their bodies. */
    readonly goals: Readonly<Record<string, unknown>>;
    /** Any other components, such as `minecraft:navigation.walk` or `minecraft:collision_box`. */
    readonly components?: Readonly<Record<string, unknown>>;
    /** The world seam; every member the test leaves out answers nothing. */
    readonly world?: GoalWorld;
    /** Draws the goals' random numbers; defaults to a seeded generator, so a run repeats. */
    readonly random?: () => number;
    /** Where the entity starts. */
    readonly at?: EntityPosition;
    /** The entity's own boolean facts, such as `in_water`. */
    readonly flags?: Partial<Record<EntityFlag, boolean>>;
    /** The world facts the time and weather tests read. */
    readonly worldFacts?: FilterWorldView;
    readonly identifier?: string;
}

/**
 * One entity with the vanilla goals registered, its scheduler, and recording
 * doubles behind both seams.
 *
 * It builds a real `EntityInstance` from a real definition, so a test
 * exercises the component parsing, the goal wrapper and the scheduler rather
 * than a goal object in isolation.
 */
export class GoalHarness {
    /** The live entity, whose `goals` scheduler the harness ticks. */
    public readonly entity: EntityInstance;

    /** What the goals did to the entity. */
    public readonly actuator: RecordingActuator;

    public constructor(options: GoalHarnessOptions) {
        const identifier = options.identifier ?? 'test:entity';
        this.actuator = new RecordingActuator(options.at ?? { x: 0, y: 0, z: 0 });

        const types = new EntityTypes({
            components: createGoalEntityRegistry({ world: () => options.world ?? {} })
        });

        const draws = options.random ?? seededRandom();
        const diagnostics = types.load([
            {
                data: {
                    format_version: '1.21.0',
                    'minecraft:entity': {
                        description: { identifier, is_spawnable: true, is_summonable: true },
                        components: { ...options.components, ...options.goals }
                    }
                },
                pack: 'test',
                path: `entities/${identifier}.json`
            }
        ]);
        const errors = diagnostics.filter((entry) => entry.severity === 'error');
        if (errors.length > 0) throw new Error(errors.map((entry) => entry.message).join('; '));

        this.entity = types.spawn(identifier, {
            environment: {
                actuator: this.actuator,
                random: { next: draws },
                filterContext: (): FilterContext => ({
                    self: { flag: (name) => options.flags?.[name] },
                    world: options.worldFacts
                })
            }
        });
    }

    /** Runs the scheduler the given number of ticks. */
    public tick(count = 1): void {
        for (let index = 0; index < count; index += 1) this.entity.goals.tick();
    }

    /** The goals running now, in priority order. */
    public running(): readonly string[] {
        return this.entity.goals.runningGoals();
    }

    /** Which goal holds a control flag now. */
    public holderOf(flag: ControlFlag): string | undefined {
        return this.entity.goals.holderOf(flag);
    }

    /** Whether a goal is running now. */
    public isRunning(name: string): boolean {
        return this.running().includes(name);
    }
}
