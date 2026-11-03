import { describe, expect, it } from 'vitest';

import { findNoiseSpawnPosition } from './NoiseSpawnFinder';

describe('findNoiseSpawnPosition', () => {
    it('returns the origin without sampling when there are no spawn targets', () => {
        let sampled = false;

        const actual = findNoiseSpawnPosition([], () => {
            sampled = true;
            return 0;
        });

        expect(actual).toEqual({ x: 0, y: 0, z: 0, candidates: 0 });
        expect(sampled).toBe(false);
    });
});
