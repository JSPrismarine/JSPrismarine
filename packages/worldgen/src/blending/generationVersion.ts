/**
 * The data versions that decide whether a chunk counts as old generation.
 *
 * Java stamps every chunk it saves with its `DataVersion`. When a release changes how terrain
 * generates, Mojang registers `BlendingDataFix` at that release's data version, and every
 * overworld chunk saved before it is loaded as old: new chunks blend toward it. 26.3 registers
 * the fix at 4997, so chunks from before 26.3 blend.
 *
 * Both numbers come from the pinned jar. `vectors/blending.json` records what the jar reports and
 * `blending.test.ts` fails when these drift from it, which is the reminder to update them after a
 * Java version bump.
 */

/** The `DataVersion` of the Java release this package generates, 26.3's. */
export const GENERATION_DATA_VERSION = 5023;

/**
 * The lowest `DataVersion` Java does not load as old generation: `IOWorker.isOldChunk` and the
 * last `BlendingDataFix` both use it.
 */
export const OLD_GENERATION_BELOW_DATA_VERSION = 4997;

/**
 * Whether a chunk stamped with a data version is old generation, in Java's terms.
 *
 * @param dataVersion - The chunk's stamp, or undefined for a chunk that carries none, which Java
 *   reads as 0 and so as old.
 */
export const isOldGenerationDataVersion = (dataVersion: number | undefined): boolean =>
    (dataVersion ?? 0) < OLD_GENERATION_BELOW_DATA_VERSION;
