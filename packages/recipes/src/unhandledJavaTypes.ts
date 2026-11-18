/**
 * The reviewed entries of Java's `minecraft:recipe_serializer` registry that this package has no reader for.
 * `unhandledJavaTypes.test.ts` checks the list against the pinned Java registry report, and
 * fails when an entry gains a reader or leaves the report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:blasting`, with a one-line reason.
 */
export const UNHANDLED_RECIPE_SERIALIZER: readonly string[] = [];
