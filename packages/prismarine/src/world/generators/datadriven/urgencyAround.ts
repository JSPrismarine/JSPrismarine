import { GENERATION_PRIORITIES } from '@jsprismarine/chunkgen';
import type { GenerationPriority } from '@jsprismarine/chunkgen';

/**
 * The most urgent band among the requested chunks within a Chebyshev radius of a position.
 *
 * A status task is wanted as urgently as the most urgent chunk that reads its output. A player's
 * `immediate` chunk reads the terrain of the 5 by 5 around it and the feature passes of the 3 by 3,
 * so the neighbors' tasks inherit that band instead of defaulting to `soon` and waiting behind
 * every other background task.
 *
 * @param urgencies - The band of every chunk somebody is waiting on, by key.
 * @param keyOf - Builds the key a chunk's band is stored under.
 * @param chunkX - Chunk x of the task's own chunk.
 * @param chunkZ - Chunk z of the task's own chunk.
 * @param radius - How far the chunks that read this task's output can be.
 * @returns The best band found, or `soon` when nobody nearby was asked for.
 */
export const urgencyAround = (
    urgencies: ReadonlyMap<string, GenerationPriority>,
    keyOf: (chunkX: number, chunkZ: number) => string,
    chunkX: number,
    chunkZ: number,
    radius: number
): GenerationPriority => {
    let best: number = GENERATION_PRIORITIES.length;
    for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const band = urgencies.get(keyOf(chunkX + dx, chunkZ + dz));
            if (band === undefined) continue;

            best = Math.min(best, GENERATION_PRIORITIES.indexOf(band));
            if (best === 0) return 'immediate';
        }
    }

    return best === GENERATION_PRIORITIES.length ? 'soon' : GENERATION_PRIORITIES[best]!;
};
