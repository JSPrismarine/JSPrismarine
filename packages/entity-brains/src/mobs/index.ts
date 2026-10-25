/**
 * The twenty mobs that build a brain in Java Edition 26.3.
 *
 * The list is not a judgement call: scanning the constant pool of every top-level class under
 * `net/minecraft/world/entity/` for `brainProvider` or `makeBrain` finds 21 classes, and one of
 * them is `LivingEntity`, which holds the base. Everything else in the game, including every
 * zombie, skeleton, farm animal, slime, guardian and the ender dragon, is goals only.
 */

import type { BrainMobDefinition, BrainMobRegistry } from '../registry.js';
import { ALLAY_BRAIN } from './allay.js';
import { ARMADILLO_BRAIN } from './armadillo.js';
import { AXOLOTL_BRAIN } from './axolotl.js';
import { BREEZE_BRAIN } from './breeze.js';
import { CAMEL_BRAIN } from './camel.js';
import { COPPER_GOLEM_BRAIN } from './copperGolem.js';
import { CREAKING_BRAIN } from './creaking.js';
import { FROG_BRAIN } from './frog.js';
import { GOAT_BRAIN } from './goat.js';
import { HAPPY_GHAST_BRAIN } from './happyGhast.js';
import { HOGLIN_BRAIN } from './hoglin.js';
import { NAUTILUS_BRAIN, ZOMBIE_NAUTILUS_BRAIN } from './nautilus.js';
import { PIGLIN_BRAIN } from './piglin.js';
import { PIGLIN_BRUTE_BRAIN } from './piglinBrute.js';
import { SNIFFER_BRAIN } from './sniffer.js';
import { TADPOLE_BRAIN } from './tadpole.js';
import { VILLAGER_BRAIN } from './villager.js';
import { WARDEN_BRAIN } from './warden.js';
import { ZOGLIN_BRAIN } from './zoglin.js';

/** Every brain mob, in the order the research note lists them. */
export const BRAIN_MOBS: readonly BrainMobDefinition[] = [
    ALLAY_BRAIN,
    ARMADILLO_BRAIN,
    AXOLOTL_BRAIN,
    BREEZE_BRAIN,
    CAMEL_BRAIN,
    COPPER_GOLEM_BRAIN,
    CREAKING_BRAIN,
    FROG_BRAIN,
    GOAT_BRAIN,
    HAPPY_GHAST_BRAIN,
    HOGLIN_BRAIN,
    NAUTILUS_BRAIN,
    PIGLIN_BRAIN,
    PIGLIN_BRUTE_BRAIN,
    SNIFFER_BRAIN,
    TADPOLE_BRAIN,
    VILLAGER_BRAIN,
    WARDEN_BRAIN,
    ZOGLIN_BRAIN,
    ZOMBIE_NAUTILUS_BRAIN
];

/**
 * The two mobs that carry both AI systems, `registerGoals` and `brainProvider`.
 *
 * A server running `@jsprismarine/entity-goals` beside this package must run both schedulers for
 * these two and neither system's alone.
 */
export const DUAL_SYSTEM_MOBS: readonly string[] = BRAIN_MOBS.filter((mob) => mob.alsoRunsGoals).map((mob) => mob.id);

/** Registers all twenty brain mobs. This is the whole entry point a server needs. */
export function registerBrainMobs(registry: BrainMobRegistry): void {
    for (const mob of BRAIN_MOBS) {
        registry.register(mob);
    }
}

export * from './allay.js';
export * from './armadillo.js';
export * from './axolotl.js';
export * from './breeze.js';
export * from './camel.js';
export * from './copperGolem.js';
export * from './creaking.js';
export * from './frog.js';
export * from './goat.js';
export * from './happyGhast.js';
export * from './hoglin.js';
export * from './nautilus.js';
export * from './piglin.js';
export * from './piglinBrute.js';
export * from './sniffer.js';
export * from './tadpole.js';
export * from './villager.js';
export * from './warden.js';
export * from './zoglin.js';
