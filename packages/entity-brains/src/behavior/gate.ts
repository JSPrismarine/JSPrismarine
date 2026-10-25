/**
 * The combinators. Nearly every vanilla activity table is built out of these four.
 *
 * `GateBehavior` runs a weighted list of behaviors under one set of memory conditions, `RunOne` is
 * the shuffled one-of-them case, `TriggerGate` is the same over plain triggers rather than full
 * behaviors, and `ShufflingList` is the weighted draw all three share.
 */

import type { MemoryModuleType } from '../memory.js';
import type { BrainContext } from '../world.js';
import type { BehaviorControl, BehaviorStatus, MemoryConditions, Trigger } from './control.js';
import { OneShot } from './control.js';

/**
 * Java's `ShufflingList`: a weighted list that reorders in place.
 *
 * The draw is the exponential ranking trick Java uses: each entry takes the key
 * `-random ** (1 / weight)` and the list sorts ascending, which makes the probability that a given
 * entry sorts first proportional to its weight.
 */
export class ShufflingList<Item> {
    private readonly entries: { readonly item: Item; readonly weight: number; key: number }[] = [];

    public add(item: Item, weight: number): this {
        this.entries.push({ item, weight, key: 0 });
        return this;
    }

    public shuffle(random: () => number): this {
        for (const entry of this.entries) {
            entry.key = -(random() ** (1 / entry.weight));
        }
        this.entries.sort((a, b) => a.key - b.key);
        return this;
    }

    public items(): readonly Item[] {
        return this.entries.map((entry) => entry.item);
    }
}

/** Java's `GateBehavior.OrderPolicy`. */
export type OrderPolicy = 'ordered' | 'shuffled';

/** Java's `GateBehavior.RunningPolicy`. */
export type RunningPolicy = 'run_one' | 'try_all';

/** One entry of a gate's list. */
export type WeightedBehavior = readonly [behavior: BehaviorControl, weight: number];

/** Options for {@link GateBehavior}. */
export interface GateOptions {
    readonly name?: string;
    readonly entryCondition?: MemoryConditions;
    /** Erased when the gate stops. Java's `exitErasedMemories`. */
    readonly exitErasedMemories?: readonly MemoryModuleType<unknown>[];
}

/**
 * Java's `GateBehavior`.
 *
 * A gate is running while at least one of its children is. `tickOrStop` ticks every running child
 * and stops the gate once none of them is left, so a `run_one` gate ends when its chosen child
 * ends, and a `try_all` gate ends when the last of them does.
 */
export class GateBehavior implements BehaviorControl {
    public readonly name: string;

    private behaviorStatus: BehaviorStatus = 'stopped';
    private readonly list = new ShufflingList<BehaviorControl>();
    private readonly children: readonly BehaviorControl[];
    private readonly entryCondition: MemoryConditions;
    private readonly exitErasedMemories: readonly MemoryModuleType<unknown>[];

    public constructor(
        private readonly orderPolicy: OrderPolicy,
        private readonly runningPolicy: RunningPolicy,
        behaviors: readonly WeightedBehavior[],
        options: GateOptions = {}
    ) {
        this.name = options.name ?? 'GateBehavior';
        this.entryCondition = options.entryCondition ?? new Map();
        this.exitErasedMemories = options.exitErasedMemories ?? [];
        for (const [behavior, weight] of behaviors) {
            this.list.add(behavior, weight);
        }
        this.children = behaviors.map(([behavior]) => behavior);
    }

    public get status(): BehaviorStatus {
        return this.behaviorStatus;
    }

    public get requiredMemories(): readonly MemoryModuleType<unknown>[] {
        const memories = new Set<MemoryModuleType<unknown>>(this.entryCondition.keys());
        for (const child of this.children) {
            for (const memory of child.requiredMemories) {
                memories.add(memory);
            }
        }
        return [...memories];
    }

    public tryStart(context: BrainContext, timestamp: number): boolean {
        for (const [memory, status] of this.entryCondition) {
            if (!context.body.brain.checkMemory(memory, status)) {
                return false;
            }
        }
        this.behaviorStatus = 'running';
        if (this.orderPolicy === 'shuffled') {
            this.list.shuffle(() => context.world.random());
        }
        for (const child of this.list.items()) {
            if (child.status !== 'stopped') {
                continue;
            }
            if (child.tryStart(context, timestamp) && this.runningPolicy === 'run_one') {
                break;
            }
        }
        return true;
    }

    public tickOrStop(context: BrainContext, timestamp: number): void {
        for (const child of this.list.items()) {
            if (child.status === 'running') {
                child.tickOrStop(context, timestamp);
            }
        }
        if (!this.list.items().some((child) => child.status === 'running')) {
            this.doStop(context, timestamp);
        }
    }

    public doStop(context: BrainContext, timestamp: number): void {
        this.behaviorStatus = 'stopped';
        for (const child of this.list.items()) {
            if (child.status === 'running') {
                child.doStop(context, timestamp);
            }
        }
        for (const memory of this.exitErasedMemories) {
            context.body.brain.eraseMemory(memory);
        }
    }
}

/**
 * Java's `RunOne`: a shuffled gate that starts the first child that will start.
 *
 * It is the most used combinator in the game; sixteen of the twenty brain mobs build at least one.
 */
export class RunOne extends GateBehavior {
    public constructor(behaviors: readonly WeightedBehavior[], entryCondition?: MemoryConditions) {
        super('shuffled', 'run_one', behaviors, { name: 'RunOne', entryCondition });
    }
}

/** One entry of a {@link triggerGate} list. */
export type WeightedTrigger = readonly [trigger: Trigger, weight: number];

/**
 * Java's `TriggerGate.triggerGate`: a gate over plain triggers.
 *
 * The difference from {@link GateBehavior} is that the result is a single {@link OneShot}: the
 * triggers fire inside one tick and nothing stays running, so the gate never occupies a priority
 * slot across ticks.
 */
export function triggerGate(
    behaviors: readonly WeightedTrigger[],
    orderPolicy: OrderPolicy,
    runningPolicy: RunningPolicy
): OneShot {
    const list = new ShufflingList<Trigger>();
    for (const [trigger, weight] of behaviors) {
        list.add(trigger, weight);
    }
    return new OneShot('TriggerGate', [], (context, timestamp) => {
        if (orderPolicy === 'shuffled') {
            list.shuffle(() => context.world.random());
        }
        for (const trigger of list.items()) {
            if (trigger(context, timestamp) && runningPolicy === 'run_one') {
                break;
            }
        }
        return true;
    });
}

/** Java's `TriggerGate.triggerOneShuffled`. */
export function triggerOneShuffled(behaviors: readonly WeightedTrigger[]): OneShot {
    return triggerGate(behaviors, 'shuffled', 'run_one');
}
