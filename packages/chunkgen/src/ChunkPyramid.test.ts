import { describe, expect, it } from 'vitest';

import type { ChunkStatus } from './ChunkStatus';
import { CHUNK_STATUSES } from './ChunkStatus';
import { GENERATION_PYRAMID, RADIUS_AROUND_FULL_CHUNK, SAFETY_MARGIN_CHUNKS } from './ChunkPyramid';
import { ChunkReadOutOfWindowError } from './ChunkStep';

const repeat = (status: ChunkStatus, count: number): ChunkStatus[] => Array.from({ length: count }, () => status);

/**
 * `ChunkStep.directDependencies()` from section 2 of docs/research/java-chunk-generation-pipeline.md,
 * typed out from the research note rather than from the builder, so a slip in the builder's
 * `addRequirement` arithmetic fails here instead of being confirmed by it.
 */
const DIRECT: Record<ChunkStatus, ChunkStatus[]> = {
    empty: [],
    structure_starts: ['empty'],
    structure_references: repeat('structure_starts', 9),
    biomes: ['structure_references', ...repeat('structure_starts', 8)],
    terrain: ['biomes', 'biomes', ...repeat('structure_starts', 7)],
    features: ['terrain', 'terrain', ...repeat('structure_starts', 7)],
    initialize_light: ['features'],
    light: ['initialize_light', 'initialize_light'],
    spawn: ['light', 'biomes'],
    full: ['spawn']
};

/** `ChunkStep.accumulatedDependencies()` from the same section, likewise typed out by hand. */
const ACCUMULATED: Record<ChunkStatus, ChunkStatus[]> = {
    empty: [],
    structure_starts: ['empty'],
    structure_references: repeat('structure_starts', 9),
    biomes: ['structure_references', ...repeat('structure_starts', 8)],
    terrain: ['biomes', 'biomes', ...repeat('structure_starts', 8)],
    features: ['terrain', 'terrain', 'biomes', ...repeat('structure_starts', 8)],
    initialize_light: ['features', 'terrain', 'biomes', ...repeat('structure_starts', 8)],
    light: ['initialize_light', 'initialize_light', 'terrain', 'biomes', ...repeat('structure_starts', 8)],
    spawn: ['light', 'initialize_light', 'terrain', 'biomes', ...repeat('structure_starts', 8)],
    full: ['spawn', 'initialize_light', 'terrain', 'biomes', ...repeat('structure_starts', 8)]
};

/** The write radius table. -1 is the default and excludes the step's own chunk. */
const WRITE_RADIUS: Record<ChunkStatus, number> = {
    empty: -1,
    structure_starts: -1,
    structure_references: -1,
    biomes: -1,
    terrain: 0,
    features: 1,
    initialize_light: -1,
    light: -1,
    spawn: -1,
    full: -1
};

describe('the generation pyramid against the jar tables', () => {
    it.each(CHUNK_STATUSES)('gives %s the direct dependencies the research note records', (status) => {
        expect(GENERATION_PYRAMID.stepTo(status).directDependencies.byDistance).toEqual(DIRECT[status]);
    });

    it.each(CHUNK_STATUSES)('gives %s the accumulated dependencies the research note records', (status) => {
        expect(GENERATION_PYRAMID.stepTo(status).accumulatedDependencies.byDistance).toEqual(ACCUMULATED[status]);
    });

    it('keeps the accumulated lists monotonically non-increasing in status', () => {
        for (const status of CHUNK_STATUSES) {
            const { byDistance } = GENERATION_PYRAMID.stepTo(status).accumulatedDependencies;
            const indices = byDistance.map((entry) => CHUNK_STATUSES.indexOf(entry));
            expect(indices).toEqual([...indices].sort((a, b) => b - a));
        }
    });

    it('reaches 23 by 23 at structure_starts, 7 by 7 at biomes, 5 by 5 at terrain and 3 by 3 at features', () => {
        const widthAt = (status: ChunkStatus): number => GENERATION_PYRAMID.radiusOf(status) * 2 + 1;
        expect(widthAt('structure_starts')).toBe(23);
        expect(widthAt('biomes')).toBe(7);
        expect(widthAt('terrain')).toBe(5);
        expect(widthAt('features')).toBe(3);
    });
});

describe('the radii around one chunk reaching full', () => {
    // Section 2 of the research note, "Radius required around a chunk reaching `full`". The
    // scheduler sizes every layer from this column, so a transcription slip anywhere in the
    // pyramid lands here as a wrong radius.
    const EXPECTED: ReadonlyArray<readonly [ChunkStatus, number]> = [
        ['empty', 11],
        ['structure_starts', 11],
        ['structure_references', 3],
        ['biomes', 3],
        ['terrain', 2],
        ['features', 1],
        ['initialize_light', 1],
        ['light', 0],
        ['spawn', 0]
    ];

    it.each(EXPECTED)('requires %s out to radius %i', (status, radius) => {
        expect(GENERATION_PYRAMID.radiusOf(status)).toBe(radius);
    });

    it('walks the layer widths 11, 11, 3, 3, 2, 1, 1, 0, 0 from empty upward', () => {
        expect(EXPECTED.map(([status]) => GENERATION_PYRAMID.radiusOf(status))).toEqual([11, 11, 3, 3, 2, 1, 1, 0, 0]);
    });

    it('does not require full of any neighbor, including the chunk itself', () => {
        expect(GENERATION_PYRAMID.radiusOf('full')).toBe(-1);
    });

    it('gives the target status a layer of its own at radius 0', () => {
        // Java's `ChunkStep.getAccumulatedRadiusOf` answers 0 for the target rather than reading
        // the dependency table, which never names the status it belongs to. The layer widths a
        // scheduler walks are therefore 11, 11, 3, 3, 2, 1, 1, 0, 0, 0 and not an empty last one.
        const toFull = GENERATION_PYRAMID.stepTo('full');
        expect(toFull.accumulatedRadiusOf('full')).toBe(0);
        expect(CHUNK_STATUSES.map((status) => toFull.accumulatedRadiusOf(status))).toEqual([
            11, 11, 3, 3, 2, 1, 1, 0, 0, 0
        ]);

        const toTerrain = GENERATION_PYRAMID.stepTo('terrain');
        expect(toTerrain.accumulatedRadiusOf('terrain')).toBe(0);
        expect(toTerrain.accumulatedRadiusOf('features')).toBe(-1);
    });
});

describe('the two constants Java derives from the full row', () => {
    it('puts RADIUS_AROUND_FULL_CHUNK at 11, which is ChunkLevel.MAX_LEVEL minus 33', () => {
        expect(RADIUS_AROUND_FULL_CHUNK).toBe(11);
        expect(33 + RADIUS_AROUND_FULL_CHUNK).toBe(44);
    });

    it('puts SAFETY_MARGIN_CHUNKS at 90, which needs the accumulated list to be 12 long', () => {
        expect(GENERATION_PYRAMID.stepTo('full').accumulatedDependencies.size).toBe(12);
        expect(SAFETY_MARGIN_CHUNKS).toBe(90);
    });
});

describe('the block write radius', () => {
    it.each(CHUNK_STATUSES)('gives %s the write radius the jar sets', (status) => {
        expect(GENERATION_PYRAMID.stepTo(status).blockStateWriteRadius).toBe(WRITE_RADIUS[status]);
    });

    it('lets only features write outside its own chunk, and only one ring out', () => {
        const features = GENERATION_PYRAMID.stepTo('features');
        expect(features.canWriteBlocksAt(0, 0)).toBe(true);
        expect(features.canWriteBlocksAt(-1, 1)).toBe(true);
        expect(features.canWriteBlocksAt(2, 0)).toBe(false);
        expect(features.canWriteBlocksAt(0, -2)).toBe(false);
    });

    it('lets terrain write its own chunk and nothing else', () => {
        const terrain = GENERATION_PYRAMID.stepTo('terrain');
        expect(terrain.canWriteBlocksAt(0, 0)).toBe(true);
        expect(terrain.canWriteBlocksAt(1, 0)).toBe(false);
    });

    it('lets a default-radius step write nowhere at all, not even its own chunk', () => {
        // -1 makes Java's isWithinWriteZone false everywhere. generateBiomes and buildTerrain
        // sidestep it by writing straight to the chunk they were handed rather than through a
        // region, which is why biomes can still fill a chunk at radius -1.
        for (const status of CHUNK_STATUSES) {
            if (status === 'terrain' || status === 'features') continue;
            expect(GENERATION_PYRAMID.stepTo(status).canWriteBlocksAt(0, 0)).toBe(false);
        }
    });
});

describe('the read window', () => {
    const features = GENERATION_PYRAMID.stepTo('features');

    it('hands a feature pass its own chunk and the eight neighbors at terrain', () => {
        expect(features.requireReadable(0, 0, 'terrain')).toBe('terrain');
        for (const dx of [-1, 0, 1]) {
            for (const dz of [-1, 0, 1]) expect(features.requireReadable(dx, dz, 'terrain')).toBe('terrain');
        }
    });

    it('refuses a read of a status the window does not guarantee', () => {
        // A feature pass that read a neighbor's own features would make the output depend on
        // which of the two chunks ran first.
        expect(() => features.requireReadable(1, 0, 'features')).toThrow(ChunkReadOutOfWindowError);
        expect(() => features.requireReadable(1, 0, 'features')).toThrow(
            'The features step asked for features at distance 1, where only terrain is guaranteed.'
        );
    });

    it('refuses terrain at distance 2, where only structure_starts is guaranteed', () => {
        expect(() => features.requireReadable(2, -1, 'terrain')).toThrow(
            'The features step asked for terrain at distance 2, where only structure_starts is guaranteed.'
        );
        expect(features.requireReadable(2, -1, 'structure_starts')).toBe('structure_starts');
    });

    it('refuses a chunk past the outermost ring, whatever status it asks for', () => {
        expect(() => features.requireReadable(9, 0, 'empty')).toThrow(
            'The features step read a chunk at distance 9, which is outside its window.'
        );
    });

    it('measures distance as Chebyshev, so a corner is as close as an edge', () => {
        expect(features.readableStatusAt(1, 1)).toBe('terrain');
        expect(features.readableStatusAt(8, 8)).toBe('structure_starts');
        expect(features.readableStatusAt(9, 0)).toBeUndefined();
    });

    it('carries the step, the distance and both statuses on the error', () => {
        try {
            features.requireReadable(0, 2, 'terrain');
            expect.unreachable('the read should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(ChunkReadOutOfWindowError);
            const thrown: ChunkReadOutOfWindowError = error as ChunkReadOutOfWindowError;
            expect(thrown.step).toBe('features');
            expect(thrown.distance).toBe(2);
            expect(thrown.requested).toBe('terrain');
            expect(thrown.allowed).toBe('structure_starts');
        }
    });

    it('gives structure_references the radius-8 window its 289-chunk scan needs', () => {
        const references = GENERATION_PYRAMID.stepTo('structure_references');
        expect(references.requireReadable(-8, 8, 'structure_starts')).toBe('structure_starts');
        expect(() => references.requireReadable(-9, 0, 'structure_starts')).toThrow(ChunkReadOutOfWindowError);
    });

    it('gives empty no window at all, so it cannot read any chunk including its own', () => {
        expect(() => GENERATION_PYRAMID.stepTo('empty').requireReadable(0, 0, 'empty')).toThrow(
            ChunkReadOutOfWindowError
        );
    });
});
