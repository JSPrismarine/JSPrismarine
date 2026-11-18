/**
 * The reviewed entries of the Java registries this package reads that it has no handler for.
 * `unhandledJavaTypes.test.ts` checks each list against the pinned Java registry report, and
 * fails when an entry gains a handler or leaves the report, so a list only shrinks.
 *
 * Each list holds full ids, such as `minecraft:ore`, each with a one-line reason.
 */

/** `minecraft:worldgen/feature_type` entries with no reader. */
export const UNHANDLED_FEATURE_TYPE: readonly string[] = [];

/** `minecraft:worldgen/placement_modifier_type` entries with no reader. */
export const UNHANDLED_PLACEMENT_MODIFIER_TYPE: readonly string[] = [];

/** `minecraft:block_predicate_type` entries with no reader. */
export const UNHANDLED_BLOCK_PREDICATE_TYPE: readonly string[] = [];

/** `minecraft:worldgen/block_state_provider_type` entries with no reader. */
export const UNHANDLED_BLOCK_STATE_PROVIDER_TYPE: readonly string[] = [];

/** `minecraft:height_provider_type` entries with no reader. */
export const UNHANDLED_HEIGHT_PROVIDER_TYPE: readonly string[] = [];

/** `minecraft:int_provider_type` entries with no reader. */
export const UNHANDLED_INT_PROVIDER_TYPE: readonly string[] = [];

/** `minecraft:float_provider_type` entries with no reader. */
export const UNHANDLED_FLOAT_PROVIDER_TYPE: readonly string[] = [];

/** `minecraft:rule_test` entries with no reader. */
export const UNHANDLED_RULE_TEST: readonly string[] = [];
