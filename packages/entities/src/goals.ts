import type { ComponentFactory, ComponentSchema } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import type { EntityInstance } from './entityInstance';
import type { EntityHooks } from './hooks';

/**
 * The goal seam.
 *
 * A goal is a component that carries a `priority` and `control_flags`. This
 * module owns everything the 170 `minecraft:behavior.*` goals share: the
 * interface one goal implements, the wrapper that turns a goal into a
 * component factory, and the scheduler that decides which goal holds each
 * control flag. It implements no individual goal beyond the references in
 * `goals/reference.ts`.
 */

/** The parts of an entity a goal takes over while it runs. */
export const CONTROL_FLAGS = ['move', 'look', 'jump'] as const;

/** One of {@link CONTROL_FLAGS}. */
export type ControlFlag = (typeof CONTROL_FLAGS)[number];

/**
 * One goal running on one entity.
 *
 * The scheduler calls `canStart` on a goal that is not running and
 * `canContinue` on one that is, so a goal that stops under the same condition
 * it starts under implements only `canStart`.
 */
export interface Goal {
    /** Whether the goal is ready to take its control flags. */
    canStart(): boolean;
    /** Whether a running goal keeps its control flags; defaults to {@link Goal.canStart}. */
    canContinue?(): boolean;
    /** Runs once when the goal takes its control flags. */
    start?(): void;
    /** Runs once when the goal gives its control flags up, whether it finished or was preempted. */
    stop?(): void;
    /** Runs once per tick while the goal holds its control flags. */
    tick?(): void;
}

/** The two fields every `minecraft:behavior.*` component carries. */
export interface GoalSettings {
    /** 0 is the highest priority; a lower number preempts a higher one. */
    readonly priority: number;
    /** The control flags the goal holds while it runs. */
    readonly controlFlags: readonly ControlFlag[];
}

/** A goal component's parsed value: the shared settings plus the goal's own parameters. */
export interface GoalParams<P> extends GoalSettings {
    readonly params: P;
}

/**
 * One goal implementation, which is what a later agent writes per
 * `minecraft:behavior.*` name.
 */
export interface GoalFactory<P> {
    /** The component name, such as `minecraft:behavior.random_stroll`. */
    readonly name: string;
    /** The control flags the goal holds when the definition names none. */
    readonly controlFlags: readonly ControlFlag[];
    /** Parses the goal's own parameters; `priority` and `control_flags` are handled here. */
    readonly schema: ComponentSchema<P>;
    /**
     * Builds the goal for one entity. It runs when the component initializes,
     * so a re-added component group builds a fresh goal with fresh state.
     */
    create(params: P, entity: EntityInstance): Goal;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Wraps a goal as a component factory.
 *
 * The wrapper owns `priority` and `control_flags`, registers the goal with the
 * entity's scheduler on initialize, and takes it off again on remove.
 */
export const goalComponent = <P>(factory: GoalFactory<P>): ComponentFactory<EntityHooks, GoalParams<P>> => ({
    name: factory.name,
    hooks: ['onInitialize', 'onRemove'],
    schema: (value) => {
        if (!isRecord(value)) return rejected(`${factory.name} must be an object`);

        const priority = typeof value.priority === 'number' ? value.priority : 0;
        const controlFlags = parseControlFlags(value.control_flags) ?? factory.controlFlags;
        const own = factory.schema(value);
        if (!own.ok) return own;
        return accepted({ priority, controlFlags, params: own.value });
    },
    create: (settings) => ({
        onInitialize: (entity) =>
            entity.goals.add({
                name: factory.name,
                priority: settings.priority,
                controlFlags: settings.controlFlags,
                goal: factory.create(settings.params, entity)
            }),
        onRemove: (entity) => entity.goals.remove(factory.name)
    })
});

/** Reads `control_flags`, which the goal schemas write as a list of flag names. */
const parseControlFlags = (value: unknown): readonly ControlFlag[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const flags = CONTROL_FLAGS.filter((flag) => value.includes(flag));
    return flags.length > 0 ? flags : [];
};

/** One goal registered with a scheduler. */
export interface ScheduledGoal extends GoalSettings {
    /** The component name the goal was declared under. */
    readonly name: string;
    readonly goal: Goal;
}

/**
 * Runs one goal per control flag, choosing by priority.
 *
 * The rule the documentation states is "0 is the highest priority ... If the
 * entity is busy doing a low priority behavior and a high priority behavior
 * comes up, the entity will immediately switch". So a candidate takes a flag
 * when the flag is free, or when its holder has a strictly worse priority, and
 * the holder is stopped in the same tick.
 *
 * A goal with no control flags runs alongside everything else, which is how
 * the targeting goals work.
 */
export class GoalScheduler {
    private readonly entries = new Map<string, ScheduledGoal>();
    private readonly running = new Set<string>();
    private readonly holders = new Map<ControlFlag, string>();

    /** Registers a goal, replacing any goal already registered under the name. */
    public add(entry: ScheduledGoal): void {
        this.remove(entry.name);
        this.entries.set(entry.name, entry);
    }

    /** Takes a goal off, stopping it first when it is running. */
    public remove(name: string): void {
        const entry = this.entries.get(name);
        if (entry === undefined) return;
        if (this.running.has(name)) this.stop(entry);
        this.entries.delete(name);
    }

    /** The names of the goals running now, in priority order. */
    public runningGoals(): readonly string[] {
        return this.sorted()
            .filter((entry) => this.running.has(entry.name))
            .map((entry) => entry.name);
    }

    /** The goal holding a control flag now, or undefined when the flag is free. */
    public holderOf(flag: ControlFlag): string | undefined {
        return this.holders.get(flag);
    }

    /** Every registered goal name, in priority order. */
    public names(): readonly string[] {
        return this.sorted().map((entry) => entry.name);
    }

    /**
     * Runs one tick: stops the running goals that cannot continue, starts the
     * best candidate for each free or preemptible flag, then ticks what runs.
     */
    public tick(): void {
        for (const entry of this.sorted()) {
            if (!this.running.has(entry.name)) continue;
            const keep = entry.goal.canContinue?.() ?? entry.goal.canStart();
            if (!keep) this.stop(entry);
        }

        for (const entry of this.sorted()) {
            if (this.running.has(entry.name)) continue;
            if (!this.canTakeFlags(entry)) continue;
            if (!entry.goal.canStart()) continue;
            this.preempt(entry);
            this.start(entry);
        }

        for (const entry of this.sorted()) {
            if (this.running.has(entry.name)) entry.goal.tick?.();
        }
    }

    /** Registered goals sorted by priority, then by name so the order is stable. */
    private sorted(): readonly ScheduledGoal[] {
        return [...this.entries.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    }

    private canTakeFlags(entry: ScheduledGoal): boolean {
        return entry.controlFlags.every((flag) => {
            const holder = this.holders.get(flag);
            if (holder === undefined) return true;
            const current = this.entries.get(holder);
            return current !== undefined && entry.priority < current.priority;
        });
    }

    private preempt(entry: ScheduledGoal): void {
        for (const flag of entry.controlFlags) {
            const holder = this.holders.get(flag);
            if (holder === undefined) continue;
            const current = this.entries.get(holder);
            if (current !== undefined) this.stop(current);
        }
    }

    private start(entry: ScheduledGoal): void {
        this.running.add(entry.name);
        for (const flag of entry.controlFlags) this.holders.set(flag, entry.name);
        entry.goal.start?.();
    }

    private stop(entry: ScheduledGoal): void {
        this.running.delete(entry.name);
        for (const flag of entry.controlFlags) {
            if (this.holders.get(flag) === entry.name) this.holders.delete(flag);
        }
        entry.goal.stop?.();
    }
}
