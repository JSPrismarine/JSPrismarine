import { serialize, deserialize } from 'node:v8';

import { describe, expect, it } from 'vitest';

import type { RegionBlock } from './GenerationRegion';
import { isMergedChunkParts, isPaletteTranslation, translatePalette, translateSlots } from './mergedChunk';

const AIR: RegionBlock = { java: { name: 'minecraft:air', properties: {} } };
const STONE: RegionBlock = { java: { name: 'minecraft:stone', properties: {} } };
const LOG_Y: RegionBlock = { java: { name: 'minecraft:oak_log', properties: { axis: 'y' } } };
const BONE: RegionBlock = { java: AIR.java, bedrock: { name: 'minecraft:bone_block', states: { pillar_axis: 'y' } } };

/** A stand-in for the server's mapping, which numbers blocks by name and marks logs as waterlogged. */
const mapping = (block: RegionBlock) => ({
    runtimeId: (block.bedrock?.name ?? block.java.name).length,
    water: block.java.name === 'minecraft:oak_log'
});

describe('the palette translation a merge task carries', () => {
    it('translates each distinct entry once, however many palettes list it', () => {
        let asked = 0;
        const translation = translatePalette(
            // The same stone from the tile and from two patches, as separate objects.
            [AIR, STONE, { ...STONE }, LOG_Y, { java: { ...STONE.java } }],
            (block) => {
                asked++;
                return mapping(block);
            },
            0
        );

        expect(asked).toBe(3);
        expect(translation.keys).toHaveLength(3);
    });

    it('gives a merged palette the runtime ids and water flags the server mapped, by key', () => {
        const translation = translatePalette([AIR, STONE, LOG_Y, BONE], mapping, 0);
        // A merged palette in its own order, built from new objects as a worker builds them.
        const merged = [{ java: { ...AIR.java } }, { ...LOG_Y }, { ...BONE }, { ...STONE }];

        const { runtimeIds, waterSlots } = translateSlots(merged, deserialize(serialize(translation)));

        expect([...runtimeIds]).toEqual(merged.map((block) => mapping(block).runtimeId));
        expect([...waterSlots]).toEqual([0, 1, 0, 0]);
    });

    it('refuses a merged entry the translation does not hold, rather than leaving air', () => {
        const translation = translatePalette([AIR, STONE], mapping, 0);

        expect(() => translateSlots([AIR, LOG_Y], translation)).toThrow(RangeError);
    });

    it('survives the process channel and is recognized on the other side', () => {
        const translation = translatePalette([AIR, STONE], mapping, 0);

        expect(isPaletteTranslation(deserialize(serialize(translation)))).toBe(true);
        expect(isPaletteTranslation({ ...translation, water: new Uint8Array(1) })).toBe(false);
    });

    it('recognizes the parts a worker answers with', () => {
        const parts = { sections: [], blockEntities: [], entitySpawns: [], fluidTicks: [{ x: 1, y: 2, z: 3 }] };

        expect(isMergedChunkParts(deserialize(serialize(parts)))).toBe(true);
        expect(isMergedChunkParts({ ...parts, fluidTicks: undefined })).toBe(false);
    });
});
