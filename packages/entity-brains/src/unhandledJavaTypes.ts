/**
 * The reviewed entries of Java's `minecraft:sensor_type` registry that this package has no sensor for.
 * `unhandledJavaTypes.test.ts` checks the list against the pinned Java registry report, and
 * fails when an entry gains a sensor or leaves the report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:dummy`, with a one-line reason.
 */
export const UNHANDLED_SENSOR_TYPE: readonly string[] = [];
