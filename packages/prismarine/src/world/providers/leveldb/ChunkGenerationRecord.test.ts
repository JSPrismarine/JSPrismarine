import { describe, expect, it } from 'vitest';

import {
    GENERATION_DATA_VERSION,
    OLD_GENERATION_BELOW_DATA_VERSION
} from '@jsprismarine/worldgen/blending/generationVersion';

import { Dimensions } from '../../DimensionType';
import {
    FIRST_CAVES_AND_CLIFFS_CHUNK_VERSION,
    decodeChunkGeneration,
    encodeChunkGeneration,
    encodeChunkGenerationKey,
    generationOnLoad
} from './ChunkGenerationRecord';
import { CHUNK_VERSION } from './LevelDB';

describe('the chunk generation record', () => {
    it('stamps the current data version whatever the chunk was read with', () => {
        expect(decodeChunkGeneration(encodeChunkGeneration({ dataVersion: 12 }))).toEqual({
            dataVersion: GENERATION_DATA_VERSION
        });
    });

    it('keeps blending_data, heights included, through a round trip', () => {
        const heights = Array.from({ length: 16 }, (_, index) => 64 + index * 0.5);
        const blending = { minSection: 0, maxSection: 16, heights };
        expect(decodeChunkGeneration(encodeChunkGeneration({ dataVersion: 0, blending }))).toEqual({
            dataVersion: GENERATION_DATA_VERSION,
            blending
        });
    });

    it('reads garbage as no record', () => {
        expect(decodeChunkGeneration(Buffer.from([1, 2, 3]))).toBeUndefined();
    });

    it('keys a chunk by position and dimension', () => {
        expect(encodeChunkGenerationKey(1, -2, 0)).not.toEqual(encodeChunkGenerationKey(1, -2, 1));
        expect(encodeChunkGenerationKey(-1, 2, 0).subarray(-12)).toEqual(
            Buffer.from([0xff, 0xff, 0xff, 0xff, 2, 0, 0, 0, 0, 0, 0, 0])
        );
    });
});

describe("Java's load rule", () => {
    const overworld = Dimensions.Overworld;

    it('treats a chunk stamped at or past the blending boundary as current', () => {
        for (const dataVersion of [OLD_GENERATION_BELOW_DATA_VERSION, GENERATION_DATA_VERSION]) {
            expect(
                generationOnLoad({ record: { dataVersion }, chunkVersion: CHUNK_VERSION, dimension: overworld })
            ).toEqual({ dataVersion });
        }
    });

    it('makes an unstamped or older overworld chunk old across the whole dimension', () => {
        // The Overworld runs from y -64 to 319: sections -4 up to, not including, 20.
        const fullHeight = { minSection: -4, maxSection: 20 };
        expect(generationOnLoad({ record: undefined, chunkVersion: CHUNK_VERSION, dimension: overworld })).toEqual({
            dataVersion: 0,
            blending: fullHeight
        });
        expect(
            generationOnLoad({
                record: { dataVersion: OLD_GENERATION_BELOW_DATA_VERSION - 1 },
                chunkVersion: CHUNK_VERSION,
                dimension: overworld
            }).blending
        ).toEqual(fullHeight);
    });

    it('limits a pre-1.18 Bedrock chunk to the sections it covered', () => {
        expect(
            generationOnLoad({
                record: undefined,
                chunkVersion: FIRST_CAVES_AND_CLIFFS_CHUNK_VERSION - 1,
                dimension: overworld
            }).blending
        ).toEqual({ minSection: 0, maxSection: 16 });
    });

    it('keeps a stored blending record over everything else', () => {
        const blending = { minSection: 0, maxSection: 16 };
        expect(
            generationOnLoad({
                record: { dataVersion: GENERATION_DATA_VERSION, blending },
                chunkVersion: CHUNK_VERSION,
                dimension: overworld
            })
        ).toEqual({ dataVersion: GENERATION_DATA_VERSION, blending });
    });

    it('never blends the Nether or the End', () => {
        for (const dimension of [Dimensions.Nether, Dimensions.TheEnd]) {
            expect(generationOnLoad({ record: undefined, chunkVersion: 0, dimension }).blending).toBeUndefined();
        }
    });
});
