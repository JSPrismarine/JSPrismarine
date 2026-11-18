/**
 * The reviewed entries of the Java registries this package reads that it has no handler for.
 * `unhandledJavaTypes.test.ts` checks each list against the pinned Java registry report, and
 * fails when an entry gains a handler or leaves the report, so a list only shrinks.
 *
 * Each list holds full ids, such as `minecraft:nop`, each with a one-line reason.
 */

/** `minecraft:worldgen/structure_processor` entries with no handler. */
export const UNHANDLED_STRUCTURE_PROCESSOR: readonly string[] = [];

/** `minecraft:rule_test` entries with no handler. */
export const UNHANDLED_RULE_TEST: readonly string[] = [];

/** `minecraft:pos_rule_test` entries with no handler. */
export const UNHANDLED_POS_RULE_TEST: readonly string[] = [];

/** `minecraft:rule_block_entity_modifier` entries with no handler. */
export const UNHANDLED_RULE_BLOCK_ENTITY_MODIFIER: readonly string[] = [];
