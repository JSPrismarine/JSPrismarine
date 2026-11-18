/**
 * The reviewed entries of Java's `minecraft:game_rule` registry that the gamerule table has no
 * row for. `unhandledJavaTypes.test.ts` checks the list against the pinned Java registry report,
 * and fails when an entry gains a row or leaves the report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:keep_inventory`, with a one-line reason.
 */
export const UNHANDLED_GAME_RULE: readonly string[] = [];
