import { describe, expect, it } from 'vitest';

import { endSpikesForSeed } from './endSpikes';

/**
 * The ten centers Java derives in `SpikeCacheLoader.load`: for i in 0..9,
 * `floor(42 * cos(2 * (-PI + 0.3141592653589793 * i)))` and the same with sin. They do not
 * depend on the seed; only the pillar sizes do.
 */
const CENTERS = [
    [42, 0],
    [33, 24],
    [12, 39],
    [-13, 39],
    [-34, 24],
    [-42, -1],
    [-34, -25],
    [-13, -40],
    [12, -40],
    [33, -25]
] as const;

describe('endSpikesForSeed', () => {
    it('puts the ten pillars on the radius-42 circle for any seed', () => {
        for (const seed of [0n, 1n, 1234n, -1n, 123456789012345n]) {
            const spikes = endSpikesForSeed(seed);
            expect(spikes.map((spike) => [spike.centerX, spike.centerZ])).toEqual(CENTERS.map((pair) => [...pair]));
        }
    });

    it('shapes every pillar from its shuffled index', () => {
        for (const seed of [0n, 7n, 1234n, -987654321n]) {
            const spikes = endSpikesForSeed(seed);
            const indices = spikes.map((spike) => (spike.height - 76) / 3);
            expect([...indices].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            for (const spike of spikes) {
                const n = (spike.height - 76) / 3;
                expect(spike.radius).toBe(2 + Math.floor(n / 3));
                expect(spike.guarded).toBe(n === 1 || n === 2);
            }
        }
    });

    // The two pinned lists come from running Java's own derivation: java.util.Random (the same
    // 48-bit LCG as SingleThreadedRandomSource) computes `new Random(seed).nextLong() & 65535`,
    // shuffles 0..9 with `Util.shuffle`'s loop (swap [i - 1] with [nextInt(i)] for i from 10
    // down to 2) seeded by that key, and shapes each pillar as `SpikeCacheLoader.load` does.
    // Seed 1234 reduces to key 38866, seed 0 to key 20792.
    it('matches Java for seed 1234', () => {
        expect(endSpikesForSeed(1234n)).toEqual([
            { centerX: 42, centerZ: 0, radius: 4, height: 97, guarded: false },
            { centerX: 33, centerZ: 24, radius: 5, height: 103, guarded: false },
            { centerX: 12, centerZ: 39, radius: 2, height: 82, guarded: true },
            { centerX: -13, centerZ: 39, radius: 3, height: 91, guarded: false },
            { centerX: -34, centerZ: 24, radius: 4, height: 100, guarded: false },
            { centerX: -42, centerZ: -1, radius: 4, height: 94, guarded: false },
            { centerX: -34, centerZ: -25, radius: 2, height: 79, guarded: true },
            { centerX: -13, centerZ: -40, radius: 3, height: 88, guarded: false },
            { centerX: 12, centerZ: -40, radius: 2, height: 76, guarded: false },
            { centerX: 33, centerZ: -25, radius: 3, height: 85, guarded: false }
        ]);
    });

    it('matches Java for seed 0', () => {
        expect(endSpikesForSeed(0n)).toEqual([
            { centerX: 42, centerZ: 0, radius: 4, height: 94, guarded: false },
            { centerX: 33, centerZ: 24, radius: 3, height: 91, guarded: false },
            { centerX: 12, centerZ: 39, radius: 2, height: 79, guarded: true },
            { centerX: -13, centerZ: 39, radius: 4, height: 97, guarded: false },
            { centerX: -34, centerZ: 24, radius: 3, height: 85, guarded: false },
            { centerX: -42, centerZ: -1, radius: 5, height: 103, guarded: false },
            { centerX: -34, centerZ: -25, radius: 2, height: 76, guarded: false },
            { centerX: -13, centerZ: -40, radius: 2, height: 82, guarded: true },
            { centerX: 12, centerZ: -40, radius: 3, height: 88, guarded: false },
            { centerX: 33, centerZ: -25, radius: 4, height: 100, guarded: false }
        ]);
    });
});
