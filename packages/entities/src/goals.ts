import type { ComponentFactory, ComponentSchema } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import type { EntityInstance } from './entityInstance';
import type { EntityHooks } from './hooks';
import { isRecord } from './components/schemas';

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
    /** Whether Java ticks this goal on selector gaps as well as selector ticks. */
    requiresUpdateEveryTick?(): boolean;
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

/** A registered goal with the state the scheduler keeps beside it, so a tick never looks one up by name. */
interface GoalSlot {
    readonly entry: ScheduledGoal;
    running: boolean;
    /** The goal's control flags as indices into {@link CONTROL_FLAGS}. */
    readonly flagIndices: readonly number[];
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
    private readonly entries = new Map<string, GoalSlot>();
    /** The slot holding each control flag, indexed by position in {@link CONTROL_FLAGS}. */
    private readonly holders: Array<GoalSlot | undefined> = CONTROL_FLAGS.map(() => undefined);

    /**
     * The slots in priority order, kept until a goal is added or taken off.
     *
     * {@link GoalScheduler.tick} walks the order three times a tick, and the
     * order only changes when the component set does, which is rare: an entity
     * carries its goals for its whole life unless an event swaps a component
     * group in. Sorting it per walk made the sort and its `localeCompare`
     * comparator a tenth of what ticking a mob cost.
     */
    private order: readonly GoalSlot[] | undefined;

    /** Registers a goal, replacing any goal already registered under the name. */
    public add(entry: ScheduledGoal): void {
        this.remove(entry.name);
        this.entries.set(entry.name, {
            entry,
            running: false,
            flagIndices: entry.controlFlags.map((flag) => CONTROL_FLAGS.indexOf(flag))
        });
        this.order = undefined;
    }

    /** Takes a goal off, stopping it first when it is running. */
    public remove(name: string): void {
        const slot = this.entries.get(name);
        if (slot === undefined) return;
        if (slot.running) this.stop(slot);
        this.entries.delete(name);
        this.order = undefined;
    }

    /** The names of the goals running now, in priority order. */
    public runningGoals(): readonly string[] {
        return this.sorted()
            .filter((slot) => slot.running)
            .map((slot) => slot.entry.name);
    }

    /** The goal holding a control flag now, or undefined when the flag is free. */
    public holderOf(flag: ControlFlag): string | undefined {
        return this.holders[CONTROL_FLAGS.indexOf(flag)]?.entry.name;
    }

    /** Every registered goal name, in priority order. */
    public names(): readonly string[] {
        return this.sorted().map((slot) => slot.entry.name);
    }

    /**
     * Runs one tick: stops the running goals that cannot continue, starts the
     * best candidate for each free or preemptible flag, then ticks what runs.
     *
     * @param updateSelector - When false, only running goals that request
     *   every-tick updates are ticked; selection and cleanup wait for the next
     *   selector pass.
     */
    public tick(updateSelector = true): void {
        const slots = this.sorted();

        if (!updateSelector) {
            for (const slot of slots) {
                if (slot.running && slot.entry.goal.requiresUpdateEveryTick?.() === true) slot.entry.goal.tick?.();
            }
            return;
        }

        for (const slot of slots) {
            if (!slot.running) continue;
            const { goal } = slot.entry;
            const keep = goal.canContinue?.() ?? goal.canStart();
            if (!keep) this.stop(slot);
        }

        for (const slot of slots) {
            if (slot.running) continue;
            if (!this.canTakeFlags(slot)) continue;
            if (!slot.entry.goal.canStart()) continue;
            this.preempt(slot);
            this.start(slot);
        }

        for (const slot of slots) {
            if (slot.running) slot.entry.goal.tick?.();
        }
    }

    /** Registered goals sorted by priority, then by name so the order is stable. */
    private sorted(): readonly GoalSlot[] {
        this.order ??= [...this.entries.values()].sort(
            (a, b) => a.entry.priority - b.entry.priority || a.entry.name.localeCompare(b.entry.name)
        );
        return this.order;
    }

    private canTakeFlags(slot: GoalSlot): boolean {
        for (const index of slot.flagIndices) {
            const holder = this.holders[index];
            if (holder !== undefined && slot.entry.priority >= holder.entry.priority) return false;
        }
        return true;
    }

    private preempt(slot: GoalSlot): void {
        for (const index of slot.flagIndices) {
            const holder = this.holders[index];
            if (holder !== undefined) this.stop(holder);
        }
    }

    private start(slot: GoalSlot): void {
        slot.running = true;
        for (const index of slot.flagIndices) this.holders[index] = slot;
        slot.entry.goal.start?.();
    }

    private stop(slot: GoalSlot): void {
        slot.running = false;
        for (const index of slot.flagIndices) {
            if (this.holders[index] === slot) this.holders[index] = undefined;
        }
        slot.entry.goal.stop?.();
    }
}
