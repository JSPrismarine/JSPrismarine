/**
 * Which generator made a chunk, in Java's terms, and whether that makes it old generation.
 *
 * Java stamps every chunk it saves with a `DataVersion` and gives an old chunk a `blending_data`
 * record once on load. The record is what keeps the chunk old from then on: the stamp moves to the
 * current version on every save, the record stays. A new chunk generated within eight chunks of an
 * old one bends its terrain toward it; see `@jsprismarine/worldgen/blending/Blender`.
 */
import type { PackedBlendingData } from '@jsprismarine/worldgen/blending/BlendingData';
import { GENERATION_DATA_VERSION } from '@jsprismarine/worldgen/blending/generationVersion';

/** A chunk's generation stamp. */
export interface ChunkGeneration {
    /** The Java `DataVersion` the chunk was last saved under, 0 for a chunk that had none. */
    readonly dataVersion: number;
    /** Java's `blending_data`: present when the chunk is old generation, with the area it covers. */
    readonly blending?: PackedBlendingData;
}

/** The stamp of a chunk this server's generator just made. */
export const CURRENT_GENERATION: ChunkGeneration = { dataVersion: GENERATION_DATA_VERSION };

/**
 * Whether a stamp marks old generation, Java's `ChunkAccess.isOldNoiseGeneration`.
 *
 * @javaSource ChunkAccess.isOldNoiseGeneration
 */
export const isOldGeneration = (generation: ChunkGeneration): boolean => generation.blending !== undefined;
