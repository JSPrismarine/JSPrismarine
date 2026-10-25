/**
 * The behavior lifecycle. Java's `BehaviorControl`, `Behavior`, `OneShot` and `Trigger`.
 *
 * A behavior is a small state machine with two states and four hooks. The brain starts every
 * stopped behavior whose activity is active, in priority order, then ticks every running one.
 */

import type { MemoryModuleType, MemoryStatus } from '../memory.js';
import type { BrainContext } from '../world.js';

/** Java's `Behavior.Status`. */
export type BehaviorStatus = 'stopped' | 'running';

/** The map of memory preconditions a behavior must satisfy before it may start. */
export type MemoryConditions = ReadonlyMap<MemoryModuleType<unknown>, MemoryStatus>;

/**
 * Builds a {@link MemoryConditions} from pairs, which reads closer to Java's `ImmutableMap.of`.
 */
export function conditions(
    ...entries: readonly (readonly [MemoryModuleType<unknown>, MemoryStatus])[]
): MemoryConditions {
    return new Map(entries);
}

/**
 * Anything the brain can run. Java's `BehaviorControl`.
 *
 * The brain only ever calls {@link BehaviorControl.tryStart} on a stopped behavior and
 * {@link BehaviorControl.tickOrStop} on a running one, so an implementation may rely on the
 * lifecycle being `tryStart` then zero or more `tickOrStop` then `doStop`.
 */
export interface BehaviorControl {
    /** The Java class name, which is what a debug read-out shows. */
    readonly name: string;
    readonly status: BehaviorStatus;
    /**
     * Every memory the behavior reads or writes. The brain registers each one when the behavior is
     * added, which is how a memory a mob never declares still gets a slot.
     */
    readonly requiredMemories: readonly MemoryModuleType<unknown>[];
    /** Runs the entry conditions and starts the behavior; returns whether it started. */
    tryStart(context: BrainContext, timestamp: number): boolean;
    /** Advances a running behavior, or stops it when it timed out or can no longer be used. */
    tickOrStop(context: BrainContext, timestamp: number): void;
    /** Stops a running behavior. */
    doStop(context: BrainContext, timestamp: number): void;
}

/** The hooks a {@link Behavior} subclass overrides. */
export interface BehaviorHooks {
    /** Java's `checkExtraStartConditions`, run after the memory conditions pass. */
    checkExtraStartConditions?(context: BrainContext): boolean;
    start?(context: BrainContext, timestamp: number): void;
    tick?(context: BrainContext, timestamp: number): void;
    stop?(context: BrainContext, timestamp: number): void;
    /** Java's `canStillUse`, which defaults to false, so a behavior runs one tick unless it says so. */
    canStillUse?(context: BrainContext, timestamp: number): boolean;
    /** Java's `timedOut`. `CountDownCooldownTicks` is the one vanilla behavior that overrides it. */
    timedOut?(timestamp: number): boolean;
}

/** How long a {@link Behavior} may run before it times out. */
export interface BehaviorDuration {
    readonly minDuration: number;
    readonly maxDuration: number;
}

/** Java's `Behavior.DEFAULT_DURATION`. */
export const DEFAULT_BEHAVIOR_DURATION = 60;

/**
 * A behavior with memory preconditions and a duration. Java's abstract `Behavior`.
 *
 * `tryStart` draws a duration uniformly from `[minDuration, maxDuration]` and records when the
 * behavior times out. `canStillUse` returns false by default, so a behavior that does not override
 * it runs for exactly one tick.
 */
export class Behavior implements BehaviorControl {
    public readonly name: string;

    private behaviorStatus: BehaviorStatus = 'stopped';
    private endTimestamp = 0;

    protected readonly entryCondition: MemoryConditions;
    private readonly minDuration: number;
    private readonly maxDuration: number;
    private readonly hooks: BehaviorHooks;

    public constructor(
        name: string,
        entryCondition: MemoryConditions,
        hooks: BehaviorHooks = {},
        duration: Partial<BehaviorDuration> = {}
    ) {
        this.name = name;
        this.entryCondition = entryCondition;
        this.hooks = hooks;
        this.minDuration = duration.minDuration ?? DEFAULT_BEHAVIOR_DURATION;
        this.maxDuration = duration.maxDuration ?? this.minDuration;
    }

    public get status(): BehaviorStatus {
        return this.behaviorStatus;
    }

    public get requiredMemories(): readonly MemoryModuleType<unknown>[] {
        return [...this.entryCondition.keys()];
    }

    /** Checks the memory conditions and `checkExtraStartConditions`, then draws how long this run lasts. */
    public tryStart(context: BrainContext, timestamp: number): boolean {
        if (!this.hasRequiredMemories(context) || this.hooks.checkExtraStartConditions?.(context) === false) {
            return false;
        }
        this.behaviorStatus = 'running';
        const duration = this.minDuration + context.world.randomInt(this.maxDuration + 1 - this.minDuration);
        this.endTimestamp = timestamp + duration;
        this.hooks.start?.(context, timestamp);
        return true;
    }

    /** Runs the `tick` hook while the behavior has time left and `canStillUse` holds, and stops it otherwise. */
    public tickOrStop(context: BrainContext, timestamp: number): void {
        if (!this.timedOut(timestamp) && (this.hooks.canStillUse?.(context, timestamp) ?? false)) {
            this.hooks.tick?.(context, timestamp);
        } else {
            this.doStop(context, timestamp);
        }
    }

    /** Marks the behavior stopped and runs the `stop` hook. */
    public doStop(context: BrainContext, timestamp: number): void {
        this.behaviorStatus = 'stopped';
        this.hooks.stop?.(context, timestamp);
    }

    private timedOut(timestamp: number): boolean {
        return this.hooks.timedOut?.(timestamp) ?? timestamp > this.endTimestamp;
    }

    private hasRequiredMemories(context: BrainContext): boolean {
        for (const [memory, status] of this.entryCondition) {
            if (!context.body.brain.checkMemory(memory, status)) {
                return false;
            }
        }
        return true;
    }
}

/**
 * A trigger: a function run once that reports whether it did anything. Java's `Trigger`.
 *
 * Everything built through `BehaviorBuilder` is one of these, which is most of Java's behavior
 * library.
 */
export type Trigger = (context: BrainContext, timestamp: number) => boolean;

/**
 * A behavior whose whole body is one {@link Trigger}. Java's `OneShot`.
 *
 * It is running for exactly the tick in which it fired: `tickOrStop` stops it unconditionally.
 */
export class OneShot implements BehaviorControl {
    public readonly name: string;
    public readonly requiredMemories: readonly MemoryModuleType<unknown>[];

    private behaviorStatus: BehaviorStatus = 'stopped';
    private readonly body: Trigger;

    public constructor(name: string, requiredMemories: readonly MemoryModuleType<unknown>[], body: Trigger) {
        this.name = name;
        this.requiredMemories = requiredMemories;
        this.body = body;
    }

    public get status(): BehaviorStatus {
        return this.behaviorStatus;
    }

    /** Runs the body without touching the status, which is what `GateBehavior` composes. */
    public trigger(context: BrainContext, timestamp: number): boolean {
        return this.body(context, timestamp);
    }

    /** Runs the body once. The one-shot counts as started only when the body reports it did something. */
    public tryStart(context: BrainContext, timestamp: number): boolean {
        if (!this.body(context, timestamp)) {
            return false;
        }
        this.behaviorStatus = 'running';
        return true;
    }

    /** Stops at once: a one-shot never survives into a second tick. */
    public tickOrStop(context: BrainContext, timestamp: number): void {
        this.doStop(context, timestamp);
    }

    /** Marks the one-shot stopped. It holds no state beyond its status. */
    public doStop(_context: BrainContext, _timestamp: number): void {
        this.behaviorStatus = 'stopped';
    }
}

/**
 * Java's `DoNothing`: occupies its activity for a drawn number of ticks and does nothing else.
 *
 * It is not a {@link Behavior} in Java either, because it has no memory conditions and must start
 * unconditionally.
 */
export class DoNothing implements BehaviorControl {
    public readonly name = 'DoNothing';
    public readonly requiredMemories: readonly MemoryModuleType<unknown>[] = [];

    private behaviorStatus: BehaviorStatus = 'stopped';
    private endTimestamp = 0;

    public constructor(
        private readonly minDuration: number,
        private readonly maxDuration: number
    ) {}

    public get status(): BehaviorStatus {
        return this.behaviorStatus;
    }

    /** Always starts, and draws how many ticks the mob stands still for. */
    public tryStart(context: BrainContext, timestamp: number): boolean {
        this.behaviorStatus = 'running';
        this.endTimestamp =
            timestamp + this.minDuration + context.world.randomInt(this.maxDuration + 1 - this.minDuration);
        return true;
    }

    /** Keeps standing still until the drawn duration runs out. */
    public tickOrStop(context: BrainContext, timestamp: number): void {
        if (timestamp > this.endTimestamp) {
            this.doStop(context, timestamp);
        }
    }

    /** Marks the wait stopped. */
    public doStop(_context: BrainContext, _timestamp: number): void {
        this.behaviorStatus = 'stopped';
    }
}
