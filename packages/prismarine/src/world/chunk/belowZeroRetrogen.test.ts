import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { Dimensions } from '../DimensionType';
import { applyBelowZeroRetrogen, belowZeroRetrogenOf } from './belowZeroRetrogen';
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
});
