import { describe, expect, it } from 'vitest';

import { Dimensions } from '../DimensionType';
import Chunk from './Chunk';
import { CURRENT_GENERATION, isOldGeneration } from './ChunkGeneration';

describe("a chunk's generation stamp", () => {
    it('starts as current generation', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        expect(chunk.getGeneration()).toBe(CURRENT_GENERATION);
        expect(isOldGeneration(chunk.getGeneration())).toBe(false);
    });

    it('marks a saved chunk dirty when the stamp changes, and not when it stays', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.markSaved();
        chunk.setGeneration(CURRENT_GENERATION);
        expect(chunk.getHasChanged()).toBe(false);

        chunk.setGeneration({ dataVersion: 0, blending: { minSection: 0, maxSection: 16 } });
        expect(chunk.getHasChanged()).toBe(true);
        expect(isOldGeneration(chunk.getGeneration())).toBe(true);
    });

    it('stays clean when a provider sets the stamp before marking the chunk loaded', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.setGeneration({ dataVersion: 0, blending: { minSection: -4, maxSection: 20 } });
        chunk.markLoadedFromDisk([], false);
        expect(chunk.getHasChanged()).toBe(false);
    });
});
