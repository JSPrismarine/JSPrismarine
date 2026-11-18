/**
 * The reviewed entries of Java's `minecraft:loot_pool_entry_type` registry that this package has no reader for.
 * `unhandledJavaTypes.test.ts` checks the list against the pinned Java registry report, and
 * fails when an entry gains a reader or leaves the report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:item`, with a one-line reason.
 */
export const UNHANDLED_LOOT_POOL_ENTRY_TYPE: readonly string[] = [];
