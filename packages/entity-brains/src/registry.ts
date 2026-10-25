/**
 * The registry of brain mobs, and the one entry point a server needs.
 *
 * Exactly twenty mob classes in Java build a brain. `registerBrainMobs` wires all twenty, and
 * `src/mobs/registry.test.ts` asserts that none is missing.
 */

import type { Brain } from './brain.js';
import type { MemoryModuleType } from './memory.js';
import type { SensorTypeName } from './sensing/sensors.js';
import type { BrainContext } from './world.js';

/** What a host knows about a body before its brain exists. */
export interface BrainMobOptions {
    /** A baby villager gets the `play` activity and the baby schedule instead of `work`. */
    readonly baby?: boolean;
    /**
     * The mob's variant, where the brain depends on it. The villager reads its profession id here,
     * which decides its job-site point of interest type and the weights in its work package.
     */
    readonly variant?: string;
}

/** One mob's brain. Java's `<Mob>Ai` class plus the `brainProvider` field on the mob. */
export interface BrainMobDefinition {
    /** The entity type id, such as `minecraft:piglin`. */
    readonly id: string;
    /** The memory types the mob declares beyond the ones its sensors and behaviors require. */
    readonly memories: readonly MemoryModuleType<unknown>[];
    /** The sensor types the mob registers, in Java's order. */
    readonly sensorTypes: readonly SensorTypeName[];
    /**
     * Whether the mob also runs the Bedrock goal scheduler.
     *
     * Two do: `Camel` and `HappyGhast` carry both `registerGoals` and `brainProvider`. Everything
     * else is one system or the other.
     */
    readonly alsoRunsGoals: boolean;
    /** Builds the brain. Java's `Brain.Provider.makeBrain`. */
    makeBrain(options?: BrainMobOptions): Brain;
    /** Java's `<Mob>Ai.initMemories`, run once when the mob is first placed in the world. */
    initMemories?(context: BrainContext): void;
    /**
     * Java's `<Mob>Ai.updateActivity`, run from the mob's own tick before the brain ticks.
     *
     * This is where the between-activity priority lives: the brain itself never chooses an
     * activity, it only answers whether one is possible.
     */
    updateActivity(context: BrainContext): void;
}

/** A mutable registry of brain mobs. */
export class BrainMobRegistry {
    private readonly definitions = new Map<string, BrainMobDefinition>();

    public register(definition: BrainMobDefinition): void {
        if (this.definitions.has(definition.id)) {
            throw new Error(`Duplicate brain mob: ${definition.id}`);
        }
        this.definitions.set(definition.id, definition);
    }

    public get(id: string): BrainMobDefinition | undefined {
        return this.definitions.get(id);
    }

    public get ids(): readonly string[] {
        return [...this.definitions.keys()];
    }

    public get all(): readonly BrainMobDefinition[] {
        return [...this.definitions.values()];
    }

    public get size(): number {
        return this.definitions.size;
    }
}
