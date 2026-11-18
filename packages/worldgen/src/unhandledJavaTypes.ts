/**
 * The reviewed entries of the Java registries this package reads that it has no handler for.
 * `unhandledJavaTypes.test.ts` checks each list against the pinned Java registry report, and
 * fails when an entry gains a handler or leaves the report, so a list only shrinks.
 *
 * Each list holds full ids, such as `minecraft:block`, each with a one-line reason.
 */

/** `minecraft:worldgen/material_rule_type` entries with no reader. */
export const UNHANDLED_MATERIAL_RULE_TYPE: readonly string[] = [];

/** `minecraft:worldgen/material_condition_type` entries with no reader. */
export const UNHANDLED_MATERIAL_CONDITION_TYPE: readonly string[] = [];

/** `minecraft:worldgen/density_function_type` entries with no reader. */
export const UNHANDLED_DENSITY_FUNCTION_TYPE: readonly string[] = [];

/** `minecraft:worldgen/carver_type` entries with no reader. */
export const UNHANDLED_CARVER_TYPE: readonly string[] = [];
