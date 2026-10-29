/**
 * The data a Bun-compiled executable carries, as base64 text.
 *
 * Node's single executable has `node:sea`'s asset table to hold the data bundle; Bun's
 * `--compile` has no equivalent this code can read back, and Bun does not implement `node:sea`
 * at all. What Bun does bundle reliably is module source, so the packager rewrites the two
 * constants below with the real payload, compiles, and restores this file. A checkout therefore
 * always holds the empty pair, which {@link hasEmbeddedData} reads as "not a packaged build" —
 * the same answer `isSea()` gives outside a single executable.
 *
 * Base64 costs a third more bytes than the raw bundle and one decode at startup, which is the
 * price of travelling as source. The bundle is gzipped before encoding, so the constant is a
 * few megabytes rather than the tens of megabytes the files unpack to.
 *
 * @see `scripts/data-bundle.mts` for what goes into the bundle.
 */

/** Base64 of the gzipped data bundle, in the {@link `./dataBundle.ts`} format. Empty in a checkout. */
export const EMBEDDED_DATA_BUNDLE = '';

/** The JSON manifest describing the bundle and the pinned Bedrock server. Empty in a checkout. */
export const EMBEDDED_DATA_MANIFEST = '';

/** Whether this build carries embedded data, which only a Bun-compiled executable does. */
export const hasEmbeddedData = (): boolean => EMBEDDED_DATA_BUNDLE.length > 0;
