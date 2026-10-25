import { ComponentRegistry } from '@jsprismarine/content';
import type { EntityComponentRegistry, EntityInstance } from '@jsprismarine/entities';
import { registerEntityComponents } from '@jsprismarine/entities';

import type { RegisterableGoal, SupportSource } from './goal';
import { supportSource } from './goal';
import { attackingGoals } from './goals/attacking';
import { environmentGoals } from './goals/environment';
import { lookingGoals } from './goals/looking';
import { movementGoals } from './goals/movement';
import { socialGoals } from './goals/social';
import { specialGoals } from './goals/specials';
import { targetingGoals } from './goals/targeting';
import { workGoals } from './goals/work';
import type { GoalWorld } from './world';

/**
 * Every vanilla goal, and the one call that registers them.
 *
 * The seven family lists are concatenated here rather than in each family, so
 * adding a goal means adding it to its family and nothing else, and the
 * totality test reads this list against the generated inventory.
 */

/** Every goal this package implements, in family order. */
export const vanillaGoals: readonly RegisterableGoal[] = [
    ...targetingGoals,
    ...attackingGoals,
    ...lookingGoals,
    ...movementGoals,
    ...socialGoals,
    ...workGoals,
    ...environmentGoals,
    ...specialGoals
];

/** Every goal name this package registers, sorted. */
export const vanillaGoalNames: readonly string[] = vanillaGoals.map((entry) => entry.name).sort();

/** How the goals reach the world. */
export interface VanillaGoalOptions {
    /**
     * Builds the world seam for one entity. A goal whose world cannot answer
     * what it needs refuses to start, so leaving this out registers every goal
     * and runs none of them.
     */
    world?(entity: EntityInstance): GoalWorld | undefined;
    /**
     * Replaces how the support object is built, for a caller that wants to
     * wrap or record what the goals do.
     */
    support?: SupportSource;
}

/**
 * Registers all 170 vanilla `minecraft:behavior.*` goals with an entity
 * component registry.
 *
 * A name the registry already carries is left alone, which follows what
 * `registerEntityComponents` does in `@jsprismarine/entities`. That matters
 * for three names: `minecraft:behavior.float`, `random_stroll` and
 * `look_at_player` ship there as reference implementations, so register these
 * goals before the components to get this package's versions, or use
 * {@link createGoalEntityRegistry}, which does it in that order.
 *
 * @param registry - The registry the entity types resolve against.
 * @returns The names that were already registered and were left alone.
 *
 * @example
 * ```typescript
 * const types = new EntityTypes({ components: createGoalEntityRegistry({ world }) });
 * ```
 */
export const registerVanillaGoals = (
    registry: EntityComponentRegistry,
    options: VanillaGoalOptions = {}
): readonly string[] => {
    const source = options.support ?? supportSource((entity) => options.world?.(entity));
    const skipped: string[] = [];
    for (const entry of vanillaGoals) {
        if (registry.has(entry.name)) {
            skipped.push(entry.name);
            continue;
        }
        entry.register(registry, source);
    }
    return skipped;
};

/**
 * Builds the registry an entity runtime needs: these 170 goals first, then
 * every non-goal component `@jsprismarine/entities` implements.
 *
 * The order is what makes this package's `float`, `random_stroll` and
 * `look_at_player` win over the reference implementations in the entity
 * runtime, which skip a name that is already registered.
 */
export const createGoalEntityRegistry = (options: VanillaGoalOptions = {}): EntityComponentRegistry => {
    const registry: EntityComponentRegistry = new ComponentRegistry();
    registerVanillaGoals(registry, options);
    return registerEntityComponents(registry);
};
