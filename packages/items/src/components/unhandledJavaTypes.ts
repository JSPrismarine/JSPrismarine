/**
 * The reviewed entries of Java's `minecraft:data_component_type` registry that the item
 * component catalog has no component for. `unhandledJavaTypes.test.ts` checks the list against
 * the pinned Java registry report, and fails when an entry gains a component or leaves the
 * report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:food`, with a one-line reason.
 */
export const UNHANDLED_DATA_COMPONENT_TYPE: readonly string[] = [];
