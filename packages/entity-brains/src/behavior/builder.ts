/**
 * The declarative behavior form. Java's `BehaviorBuilder` and `MemoryAccessor`.
 *
 * Java writes it as an applicative functor over `MemoryCondition`, because DataFixerUpper gave it
 * one for free. The content is simpler than the encoding: a behavior declares which memories must
 * be present, absent or merely registered, and the body runs with a handle on each that can read
 * and write it. That is what this builds, as a fluent chain that accumulates the accessor types.
 *
 * ```typescript
 * const setLookTarget = behavior('SetEntityLookTarget')
 *     .absent(MemoryModuleTypes.LOOK_TARGET)
 *     .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
 *     .build((context, lookTarget, nearest) => {
 *         const target = nearest.get().findClosest(predicate);
 *         if (target === undefined) return false;
 *         lookTarget.set(entityTracker(target));
 *         return true;
 *     });
 * ```
 *
 * A body returning false means the behavior did not run, exactly as Java's `Trigger` does, and the
 * brain leaves it stopped so something at a worse priority may start instead.
 */

import type { Brain } from '../brain.js';
import type { MemoryModuleType, MemoryStatus } from '../memory.js';
import { MemorySlot } from '../memory.js';
import type { BrainContext, BrainMob } from '../world.js';
import type { BehaviorControl, Trigger } from './control.js';
import { OneShot } from './control.js';

/** The writes every accessor allows. Java's `MemoryAccessor`. */
export interface MemoryWriter<Value> {
    set(value: Value): void;
    setWithExpiry(value: Value, timeToLive: number): void;
    /** Writes the value, or erases the memory when it is `undefined`. */
    setOrErase(value: Value | undefined): void;
    erase(): void;
}

/** An accessor for a memory the behavior required to be present. */
export interface PresentMemory<Value> extends MemoryWriter<Value> {
    get(): Value;
}

/** An accessor for a memory the behavior required to be absent. */
export type AbsentMemory<Value> = MemoryWriter<Value>;

/** An accessor for a memory the behavior required only to be registered. */
export interface RegisteredMemory<Value> extends MemoryWriter<Value> {
    tryGet(): Value | undefined;
}

function writer<Value>(brain: Brain, memory: MemoryModuleType<Value>): MemoryWriter<Value> {
    return {
        set: (value) => brain.setMemory(memory, value),
        setWithExpiry: (value, timeToLive) => brain.setMemoryWithExpiry(memory, value, timeToLive),
        setOrErase: (value) => brain.setMemory(memory, value),
        erase: () => brain.eraseMemory(memory)
    };
}

interface Requirement {
    readonly memory: MemoryModuleType<unknown>;
    readonly status: MemoryStatus;
    accessor(brain: Brain): unknown;
}

/**
 * Accumulates memory requirements and then builds a {@link OneShot}.
 *
 * The type parameter is the tuple of accessors the body receives, in declaration order.
 */
export class BehaviorBuilder<Accessors extends readonly unknown[]> {
    private constructor(
        private readonly name: string,
        private readonly requirements: readonly Requirement[]
    ) {}

    /** Starts a chain. {@link behavior} is the shorthand. */
    public static named(name: string): BehaviorBuilder<readonly []> {
        return new BehaviorBuilder(name, []);
    }

    /** The memory must hold a value; the body gets a {@link PresentMemory}. */
    public present<Value>(
        memory: MemoryModuleType<Value>
    ): BehaviorBuilder<readonly [...Accessors, PresentMemory<Value>]> {
        return new BehaviorBuilder(this.name, [
            ...this.requirements,
            {
                memory,
                status: 'value_present',
                accessor: (brain) => {
                    const value = brain.getMemory(memory);
                    const present: PresentMemory<Value> = {
                        ...writer(brain, memory),
                        get: () => {
                            if (value === undefined) {
                                throw new Error(`${this.name} read an absent memory: ${memory.name}`);
                            }
                            return value;
                        }
                    };
                    return present;
                }
            }
        ]);
    }

    /** The memory must be empty; the body gets an {@link AbsentMemory} it can fill. */
    public absent<Value>(
        memory: MemoryModuleType<Value>
    ): BehaviorBuilder<readonly [...Accessors, AbsentMemory<Value>]> {
        return new BehaviorBuilder(this.name, [
            ...this.requirements,
            { memory, status: 'value_absent', accessor: (brain) => writer(brain, memory) }
        ]);
    }

    /** The memory need only exist; the body gets a {@link RegisteredMemory}. */
    public registered<Value>(
        memory: MemoryModuleType<Value>
    ): BehaviorBuilder<readonly [...Accessors, RegisteredMemory<Value>]> {
        return new BehaviorBuilder(this.name, [
            ...this.requirements,
            {
                memory,
                status: 'registered',
                accessor: (brain) => {
                    const registered: RegisteredMemory<Value> = {
                        ...writer(brain, memory),
                        tryGet: () => brain.getMemory(memory)
                    };
                    return registered;
                }
            }
        ]);
    }

    /** Closes the chain with the body. */
    public build(body: (context: BrainContext, ...accessors: Accessors) => boolean): OneShot {
        const requirements = this.requirements;
        return new OneShot(
            this.name,
            requirements.map((requirement) => requirement.memory),
            (context, timestamp) => {
                const brain = context.body.brain;
                for (const requirement of requirements) {
                    if (!brain.checkMemory(requirement.memory, requirement.status)) {
                        return false;
                    }
                }
                // The accessor tuple is heterogeneous and is built from the same ordered list the
                // type parameter was accumulated from, so its runtime shape matches Accessors by
                // construction. TypeScript cannot follow that through the erased requirement list.
                const accessors = requirements.map((requirement) =>
                    requirement.accessor(brain)
                ) as unknown as Accessors;
                void timestamp;
                return body(context, ...accessors);
            }
        );
    }
}

/** Starts a {@link BehaviorBuilder} chain. Java's `BehaviorBuilder.create`. */
export function behavior(name: string): BehaviorBuilder<readonly []> {
    return BehaviorBuilder.named(name);
}

/** Java's `BehaviorBuilder.triggerIf(Predicate)`: runs when the body satisfies the predicate. */
export function triggerIf(name: string, predicate: (body: BrainMob, context: BrainContext) => boolean): OneShot {
    return new OneShot(name, [], (context) => predicate(context.body, context));
}

/**
 * Java's `BehaviorBuilder.sequence`: runs `second` only when `first` fired this tick.
 *
 * Java also unions the two behaviors' required memories, which matters because the brain registers
 * memories from that list.
 */
export function sequence(first: Trigger, second: OneShot): OneShot {
    return new OneShot(`Sequence[${second.name}]`, second.requiredMemories, (context, timestamp) => {
        return first(context, timestamp) && second.trigger(context, timestamp);
    });
}

/**
 * Wraps a behavior so it only starts while the predicate holds, which is what
 * `BehaviorBuilder.triggerIf(predicate, behavior)` produces for a non-{@link OneShot} child.
 */
export function gatedBy(
    predicate: (body: BrainMob, context: BrainContext) => boolean,
    child: BehaviorControl
): BehaviorControl {
    return {
        name: `If[${child.name}]`,
        get status() {
            return child.status;
        },
        get requiredMemories() {
            return child.requiredMemories;
        },
        tryStart: (context, timestamp) => predicate(context.body, context) && child.tryStart(context, timestamp),
        tickOrStop: (context, timestamp) => child.tickOrStop(context, timestamp),
        doStop: (context, timestamp) => child.doStop(context, timestamp)
    };
}

/**
 * Java's `CountDownCooldownTicks`: decrements an integer memory once per tick and erases it at
 * zero. It overrides `timedOut` to false, so it runs until the memory runs out rather than for a
 * drawn duration, and it is in almost every mob's core activity.
 */
export function countDownCooldownTicks(cooldown: MemoryModuleType<number>): BehaviorControl {
    let running = false;
    const remaining = (brain: Brain): number | undefined => brain.getMemory(cooldown);
    return {
        name: `CountDownCooldownTicks[${cooldown.name}]`,
        get status() {
            return running ? ('running' as const) : ('stopped' as const);
        },
        requiredMemories: [cooldown],
        tryStart: (context) => {
            if (!context.body.brain.checkMemory(cooldown, 'value_present')) {
                return false;
            }
            running = true;
            return true;
        },
        tickOrStop: (context, timestamp) => {
            const left = remaining(context.body.brain);
            if (left === undefined || left <= 0) {
                running = false;
                context.body.brain.eraseMemory(cooldown);
                void timestamp;
                return;
            }
            context.body.brain.setMemory(cooldown, left - 1);
        },
        doStop: (context) => {
            running = false;
            context.body.brain.eraseMemory(cooldown);
        }
    };
}

/** Re-exported so behaviors can name the never-expire sentinel without reaching into memory.ts. */
export const NEVER_EXPIRE = MemorySlot.NEVER_EXPIRE;
