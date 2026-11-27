/**
 * The registry of brain mobs, and the one entry point a server needs.
 *
 * Exactly twenty mob classes in Java build a brain. `registerBrainMobs` wires all twenty, and
 * `src/mobs/registry.test.ts` asserts that none is missing.
 */

import type { Brain } from './brain.js';
import type { MemoryModuleType } from './memory.js';
import type { SensorTypeName } from './sensing/sensors.js';
import type { BrainContext, BrainEntity } from './world.js';
import { EntityBrainsErrors } from '@jsprismarine/errors/entity-brains';

/** What a host knows about a body before its brain exists. */
export interface BrainMobOptions {
    /** A baby villager gets the `play` activity and the baby schedule instead of `work`. */
    readonly baby?: boolean;
    /**
     * The mob's variant, where the brain depends on it. The villager reads its profession id here,
     * which decides its job-site point of interest type and the weights in its work package.
     */
    readonly variant?: string;
    /** Called when a piglin finishes admiring a barter item, so the host can roll its loot table. */
    readonly onBarter?: (context: BrainContext) => void;
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
     * Three do: `Camel` and `HappyGhast` carry both `registerGoals` and `brainProvider`, and
     * `Tadpole` inherits `AbstractFish.registerGoals`. Everything else is one system or the other.
     */
    readonly alsoRunsGoals: boolean;
    /**
     * The goals Java's `registerGoals` adds beside the brain, as Bedrock goal components and their
     * bodies, for a mob whose Bedrock file declares other goals than its Java class registers.
     * A server runs these in place of every goal the file declares. Absent means the file's goals
     * stand for Java's.
     */
    readonly goals?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    /**
     * Whether the mob's own tick runs its brain this tick. Java's `HappyGhast.customServerAiStep`
     * ticks the brain only while the ghast is a baby. Absent means every tick.
     *
     * @javaSource HappyGhast.customServerAiStep
     */
    readonly ticksBrain?: (context: BrainContext) => boolean;
    /**
     * Builds the brain. Java's `Brain.Provider.makeBrain`.
     *
     * @javaSee Brain$Provider.makeBrain
     */
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
    /**
     * Java's brain side of `<Mob>.hurtServer`: what a blow from a living attacker that landed does
     * to the brain, such as `PiglinAi.wasHurtBy` or `Warden.increaseAngerAt`. `direct` is Java's
     * `DamageSource.isDirect`: the attacker dealt the blow itself rather than through a projectile.
     */
    wasHurtBy?(context: BrainContext, attacker: BrainEntity, direct: boolean): void;
    /**
     * Whether Java's class answers `Mob.getTarget` from the brain's `ATTACK_TARGET`
     * (`getTargetFromBrain`), so a host reports that memory as the mob's target.
     */
    readonly targetFromBrain?: boolean;
}

/** A mutable registry of brain mobs. */
export class BrainMobRegistry {
    private readonly definitions = new Map<string, BrainMobDefinition>();

    /**
     * Adds a mob definition under its id.
     *
     * @throws When a definition with the same id is already registered.
     */
    public register(definition: BrainMobDefinition): void {
        if (this.definitions.has(definition.id)) {
            throw new EntityBrainsErrors.DuplicateBrainMob({ id: definition.id });
        }
        this.definitions.set(definition.id, definition);
    }

    /** The definition registered under an entity id, or undefined when the mob runs on goals instead. */
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
