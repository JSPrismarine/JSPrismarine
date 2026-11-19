/** 26.4 (format 128) added the `noise_biomes` chunk status. */
const SINCE_NOISE_BIOMES_STATUS = 128;

/**
 * The reviewed entries of Java's `minecraft:chunk_status` registry that this package has no status for.
 * `unhandledJavaTypes.test.ts` checks the list against the pinned Java registry report, and
 * fails when an entry gains a status or leaves the report, so the list only shrinks.
 *
 * Each entry is a full id, such as `minecraft:full`, with a one-line reason. A status only a newer
 * release than the default registers carries the data pack format it first appears at, so the
 * default release's report does not expect it.
 */

export const UNHANDLED_CHUNK_STATUS: readonly (string | { readonly id: string; readonly since: number })[] = [
    // 26.4 adds a rung; the ladder here keeps 26.3's ten rungs. Issue #3281.
    { id: 'minecraft:noise_biomes', since: SINCE_NOISE_BIOMES_STATUS }
];
