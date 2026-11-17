import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Dimensions } from '../DimensionType';
import { applyBelowZeroRetrogen, belowZeroRetrogenOf, markBorderTicks } from './belowZeroRetrogen';
import Chunk from './Chunk';

const id = (name: string): number => BlockRuntimeIds.getByName(name);

/** Bedrock's numeric ids for the three biomes the test uses. */
const PLAINS = 1;
const TAIGA = 5;
const LUSH_CAVES = 187;

/** A pre-1.18 chunk: bedrock at y 0 to 2, stone to 60, nothing below 0, taiga everywhere. */
const oldChunk = (): Chunk => {
    const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, 0, 2, id('minecraft:bedrock'));
            chunk.fillColumn(x, z, 3, 60, id('minecraft:stone'));
            chunk.fillBiomeColumn(x, z, TAIGA);
        }
    }
    // A shaft dug through the floor in column x 1, z 2.
    chunk.fillColumn(1, 2, 0, 60, id('minecraft:air'));
    return chunk;
};

/** What the generator made at the same place: deepslate below 0, lush caves in one quart column. */
const generatedChunk = (): Chunk => {
    const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, -64, -1, id('minecraft:deepslate'));
            chunk.fillBiomeColumn(x, z, x < 4 && z < 4 ? LUSH_CAVES : PLAINS);
        }
    }
    return chunk;
};

describe('the below-zero upgrade of a stored chunk', () => {
    it('finds the shaft dug through the old floor', () => {
        expect(belowZeroRetrogenOf(oldChunk())).toEqual(new Set([2 * 16 + 1]));
    });

    it('lays the new floor, keeps the shaft open and turns the old bedrock into deepslate', () => {
        const stored = oldChunk();
        applyBelowZeroRetrogen(stored, generatedChunk(), belowZeroRetrogenOf(stored)!);

        expect(stored.getBlock(0, -30, 0).name).toBe('minecraft:deepslate');
        expect(stored.getBlock(1, -30, 2).name).toBe('minecraft:air');
        expect(stored.getBlock(0, 1, 0).name).toBe('minecraft:deepslate');
        expect(stored.getBlock(0, 30, 0).name).toBe('minecraft:stone');
    });

    it('keeps the generated cave biome and takes the old biome everywhere else below 0', () => {
        const stored = oldChunk();
        applyBelowZeroRetrogen(stored, generatedChunk(), belowZeroRetrogenOf(stored)!);

        expect(stored.getBiome(0, -10, 0)).toBe(LUSH_CAVES);
        expect(stored.getBiome(8, -10, 8)).toBe(TAIGA);
        expect(stored.getBiome(8, 10, 8)).toBe(TAIGA);
    });

    it('keeps the ticks and marks generation left under the old floor, except in an open column', () => {
        const stored = oldChunk();
        const generated = generatedChunk();
        generated.getPendingFluidTicks().push(
            { x: 3, y: -20, z: 3, delay: 0 },
            // In the shaft, which stays open.
            { x: 1, y: -20, z: 2, delay: 0 }
        );
        generated.getPendingShapeUpdates().push({ x: 3, y: -20, z: 3 }, { x: 1, y: -20, z: 2 });

        applyBelowZeroRetrogen(stored, generated, belowZeroRetrogenOf(stored)!);

        expect(stored.getPendingFluidTicks()).toEqual([{ x: 3, y: -20, z: 3, delay: 0 }]);
        expect(stored.getPendingShapeUpdates()).toEqual([{ x: 3, y: -20, z: 3 }]);
    });
});

describe("the upgraded chunk's border ticks", () => {
    const water = id('minecraft:water');
    const oldGeneration = { dataVersion: 0, blending: { minSection: 0, maxSection: 16 } };

    /** A chunk of the old generation with water on the seams Java's border ticks look at. */
    const seamChunk = (): Chunk => {
        const chunk = new Chunk(2, -1, new Map(), Dimensions.Overworld);
        chunk.setGeneration(oldGeneration);
        // Just under and at the bottom of the old generation, and just over its top.
        chunk.setBlockRuntimeId(4, -1, 4, water);
        chunk.setBlockRuntimeId(5, 0, 5, water);
        chunk.setBlockRuntimeId(6, 256, 6, water);
        // Inside an east edge column, and inside a west one.
        chunk.setBlockRuntimeId(15, 40, 7, water);
        chunk.setBlockRuntimeId(0, 40, 7, water);
        // Off every seam.
        chunk.setBlockRuntimeId(8, 40, 8, water);
        // A waterlogged block holds its water in the liquid layer.
        chunk.setBlockRuntimeId(9, 0, 9, id('minecraft:oak_fence'));
        chunk.setBlockRuntimeId(9, 0, 9, water, 1);
        return chunk;
    };

    it('marks the fluids on the layers around the old generation and on the edges facing new chunks', () => {
        const chunk = seamChunk();
        // Only the east neighbor, chunk 3,-1, is new generation.
        markBorderTicks(chunk, (x, z) => !(x === 3 && z === -1));

        expect(chunk.getPendingShapeUpdates()).toEqual([
            { x: 36, y: -1, z: -12 },
            { x: 37, y: 0, z: -11 },
            { x: 38, y: 256, z: -10 },
            { x: 41, y: 0, z: -7 },
            { x: 47, y: 40, z: -9 }
        ]);
        expect(chunk.getPendingFluidTicks()).toEqual(chunk.getPendingShapeUpdates().map((at) => ({ ...at, delay: 0 })));
    });

    it('marks nothing in a chunk of the current generation', () => {
        const chunk = seamChunk();
        chunk.setGeneration({ dataVersion: 0 });

        markBorderTicks(chunk, () => false);

        expect(chunk.getPendingShapeUpdates()).toEqual([]);
    });
});
