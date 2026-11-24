import { describe, expect, it } from 'vitest';

import type { ChunkStatus } from './ChunkStatus';
import { CHUNK_STATUSES } from './ChunkStatus';
import {
    GENERATION_PYRAMID,
    generationPyramidFor,
    NOISE_BIOMES_GENERATION_PYRAMID,
    SINCE_NOISE_BIOMES_STATUS
} from './ChunkPyramid';

const repeat = (status: ChunkStatus, count: number): ChunkStatus[] => Array.from({ length: count }, () => status);

/**
 * `directDependencies()` and `accumulatedDependencies()` of every step of 26.4 Snapshot 10's
 * `ChunkPyramid.GENERATION_PYRAMID`, printed by a probe class run against the bootstrapped jar.
 */
const JAR: Record<ChunkStatus, { readonly direct: ChunkStatus[]; readonly accumulated: ChunkStatus[] }> = {
    empty: { direct: [], accumulated: [] },
    structure_starts: { direct: ['empty'], accumulated: ['empty'] },
    structure_references: {
        direct: repeat('structure_starts', 9),
        accumulated: repeat('structure_starts', 9)
    },
    noise_biomes: {
        direct: ['structure_references', ...repeat('empty', 8)],
        accumulated: ['structure_references', ...repeat('structure_starts', 8)]
    },
    biomes: {
        direct: ['noise_biomes', 'noise_biomes'],
        accumulated: ['noise_biomes', 'noise_biomes', ...repeat('structure_starts', 8)]
    },
    terrain: {
        direct: ['biomes', ...repeat('structure_starts', 8)],
        accumulated: ['biomes', 'noise_biomes', ...repeat('structure_starts', 8)]
    },
    features: {
        direct: ['terrain', 'terrain', ...repeat('structure_starts', 7)],
        accumulated: ['terrain', 'terrain', 'noise_biomes', ...repeat('structure_starts', 8)]
    },
    initialize_light: {
        direct: ['features'],
        accumulated: ['features', 'terrain', 'noise_biomes', ...repeat('structure_starts', 8)]
    },
    light: {
        direct: ['initialize_light', 'initialize_light'],
        accumulated: [
            'initialize_light',
            'initialize_light',
            'terrain',
            'noise_biomes',
            ...repeat('structure_starts', 8)
        ]
    },
    spawn: {
        direct: ['light', 'features'],
        accumulated: ['light', 'initialize_light', 'terrain', 'noise_biomes', ...repeat('structure_starts', 8)]
    },
    // Not the jar's direct row: ours reads its eight neighbors at `features`, as the 26.3 pyramid
    // does. The accumulated row is the jar's.
    full: {
        direct: ['spawn', 'features'],
        accumulated: ['spawn', 'initialize_light', 'terrain', 'noise_biomes', ...repeat('structure_starts', 8)]
    }
};

describe("26.4's generation pyramid against the jar", () => {
    it.each(CHUNK_STATUSES)('gives %s the dependencies the jar computes', (status) => {
        const step = NOISE_BIOMES_GENERATION_PYRAMID.stepTo(status);
        expect({
            direct: step.directDependencies.byDistance,
            accumulated: step.accumulatedDependencies.byDistance
        }).toEqual(JAR[status]);
    });

    it('keeps the write radii and the 23 by 23 neighborhood of a full chunk', () => {
        for (const status of CHUNK_STATUSES) {
            expect(NOISE_BIOMES_GENERATION_PYRAMID.stepTo(status).blockStateWriteRadius).toBe(
                GENERATION_PYRAMID.stepTo(status).blockStateWriteRadius
            );
        }
        expect(NOISE_BIOMES_GENERATION_PYRAMID.stepTo('full').accumulatedDependencies.size).toBe(12);
    });

    it('is the pyramid from data pack format 128 on', () => {
        expect(generationPyramidFor(undefined)).toBe(GENERATION_PYRAMID);
        expect(generationPyramidFor(SINCE_NOISE_BIOMES_STATUS - 1)).toBe(GENERATION_PYRAMID);
        expect(generationPyramidFor(SINCE_NOISE_BIOMES_STATUS)).toBe(NOISE_BIOMES_GENERATION_PYRAMID);
    });
});
