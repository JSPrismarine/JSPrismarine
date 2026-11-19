/**
 * The reviewed entries of the Java registries this package reads that it has no handler for.
 * `unhandledJavaTypes.test.ts` checks each list against the pinned Java registry report, and
 * fails when an entry gains a handler or leaves the report, so a list only shrinks.
 *
 * Each list holds full ids, such as `minecraft:block`, each with a one-line reason. A type only a
 * newer release than the default registers carries the data pack format it first appears at, so
 * the default release's report does not expect it.
 */

/** 26.4 (format 128) added the `domain_warp` density function type. */
const SINCE_DOMAIN_WARP = 128;

/** `minecraft:worldgen/material_rule_type` entries with no reader. */
export const UNHANDLED_MATERIAL_RULE_TYPE: readonly string[] = [];

/** `minecraft:worldgen/material_condition_type` entries with no reader. */
export const UNHANDLED_MATERIAL_CONDITION_TYPE: readonly string[] = [];

/** `minecraft:worldgen/density_function_type` entries with no reader. */
export const UNHANDLED_DENSITY_FUNCTION_TYPE: readonly (string | { readonly id: string; readonly since: number })[] = [
    // 26.4 samples an input at offset coordinates; no vanilla density function uses it. Issue #3280.
    { id: 'minecraft:domain_warp', since: SINCE_DOMAIN_WARP }
];

/** `minecraft:worldgen/carver_type` entries with no reader. */
export const UNHANDLED_CARVER_TYPE: readonly string[] = [];
