/**
 * The reviewed entries of Java's `minecraft:chunk_status` registry that this package has no status for.
 * `unhandledJavaTypes.test.ts` checks the list against the pinned Java registry report, and
 * fails when an entry gains a status or leaves the report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:full`, with a one-line reason.
 */
export const UNHANDLED_CHUNK_STATUS: readonly string[] = [];
