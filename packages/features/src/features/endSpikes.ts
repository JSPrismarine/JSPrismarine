import { LegacyRandomSource } from '@jsprismarine/worldgen';

import { shuffledCopy } from './support';

/** One of the End's ten obsidian pillars, Java's `EndSpikeFeature.EndSpike`. */
export interface EndSpike {
    /** The pillar's center x in world coordinates. */
    readonly centerX: number;
    /** The pillar's center z in world coordinates. */
    readonly centerZ: number;
    /** The obsidian disc's radius. */
    readonly radius: number;
    /** The y just above the topmost obsidian, where the bedrock cap and the crystal sit. */
    readonly height: number;
    /** Whether an iron-bar cage surrounds the pillar's crystal. */
    readonly guarded: boolean;
}

/**
 * Derives the ten spike pillars from the world seed, Java's `EndSpikeFeature.getSpikesForLevel`
 * and `SpikeCacheLoader.load`.
 *
 * Java reduces the seed to a 16-bit cache key, `new LegacyRandom(seed).nextLong() & 65535`, then
 * shuffles the indices 0 through 9 with a second generator seeded by that key. Pillar `i` sits at
 * `floor(42 * cos(2 * (-PI + 0.3141592653589793 * i)))` by the matching sine, and its shuffled
 * index `n` shapes it: radius `2 + n / 3`, height `76 + 3 * n`, an iron-bar cage when `n` is
 * 1 or 2.
 *
 * @returns The ten pillars in Java's order, counterclockwise from (42, 0).
 */
export const endSpikesForSeed = (seed: bigint): readonly EndSpike[] => {
    const key = new LegacyRandomSource(seed).nextLong() & 65535n;
    const indices = shuffledCopy([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], new LegacyRandomSource(key));
    return indices.map((n, i) => {
        const angle = 2 * (-Math.PI + 0.3141592653589793 * i);
        return {
            centerX: Math.floor(42 * Math.cos(angle)),
            centerZ: Math.floor(42 * Math.sin(angle)),
            radius: 2 + Math.floor(n / 3),
            height: 76 + 3 * n,
            guarded: n === 1 || n === 2
        };
    });
};
