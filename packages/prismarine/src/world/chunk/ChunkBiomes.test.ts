import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { Dimensions, subChunkCount } from '../Dimension';
import { ChunkBiomes, PLAINS_BIOME } from './ChunkBiomes';

/** `minecraft:desert` and `minecraft:jungle` as the client numbers them. */
const DESERT = 2;
const JUNGLE = 21;

describe('world', () => {
    describe('ChunkBiomes', () => {
        it('starts as plains everywhere', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);

            expect(biomes.get(0, -64, 0)).toBe(PLAINS_BIOME);
            expect(biomes.get(15, 319, 15)).toBe(PLAINS_BIOME);
        });

        it('reads back a biome written at one block', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            biomes.set(3, 70, 4, DESERT);

            expect(biomes.get(3, 70, 4)).toBe(DESERT);
            expect(biomes.get(3, 71, 4)).toBe(PLAINS_BIOME);
            expect(biomes.get(4, 70, 4)).toBe(PLAINS_BIOME);
        });

        it('fills a whole column', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            biomes.fillColumn(7, 9, JUNGLE);

            expect(biomes.get(7, -64, 9)).toBe(JUNGLE);
            expect(biomes.get(7, 0, 9)).toBe(JUNGLE);
            expect(biomes.get(7, 319, 9)).toBe(JUNGLE);
            expect(biomes.get(8, 0, 9)).toBe(PLAINS_BIOME);
        });

        it('carries as many sections as the dimension has sub chunks', () => {
            expect(new ChunkBiomes(Dimensions.Nether).toSectionIds()).toHaveLength(subChunkCount(Dimensions.Nether));
            expect(new ChunkBiomes(Dimensions.TheEnd).toSectionIds()).toHaveLength(subChunkCount(Dimensions.TheEnd));
        });

        it('round trips through the per-section arrays the disk codec uses', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            biomes.fillSection(4, DESERT);
            biomes.set(1, 70, 2, JUNGLE);

            const restored = ChunkBiomes.fromSectionIds(biomes.toSectionIds(), Dimensions.Overworld);

            expect(restored.get(1, 70, 2)).toBe(JUNGLE);
            expect(restored.get(0, 70, 0)).toBe(DESERT);
            expect(restored.get(0, 0, 0)).toBe(PLAINS_BIOME);
        });

        it('hands a uniform section over as one id and a mixed one as an array', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            biomes.fillSection(4, DESERT);
            biomes.set(1, 70, 2, JUNGLE);

            const sections = biomes.toSectionIds();

            // Section 4 is y 64 to 79, which is also where the single jungle block went.
            const mixed = sections[4 + 4];
            expect(sections[0]).toBe(PLAINS_BIOME);
            expect(mixed).toBeInstanceOf(Int32Array);
            if (typeof mixed === 'number') throw new Error('a section holding two biomes is not uniform');
            expect(mixed).toHaveLength(4096);
        });

        it('takes a whole section as one id', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            biomes.setSection(4, DESERT);

            expect(biomes.get(0, 64, 0)).toBe(DESERT);
            expect(biomes.get(15, 79, 15)).toBe(DESERT);
            expect(biomes.get(0, 80, 0)).toBe(PLAINS_BIOME);
            expect(biomes.toSectionIds()[4 + 4]).toBe(DESERT);
        });

        it('takes a whole section spelled out, and reads back what each block was given', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            const ids = new Uint16Array(4096);
            // The same XZY order with y fastest the packed form uses.
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    for (let y = 0; y < 16; y++) ids[(x << 8) | (z << 4) | y] = x < 8 ? DESERT : JUNGLE;
                }
            }
            biomes.setSection(4, ids);

            expect(biomes.get(7, 70, 3)).toBe(DESERT);
            expect(biomes.get(8, 70, 3)).toBe(JUNGLE);
            expect(biomes.toSectionIds()[4 + 4]).toBeInstanceOf(Int32Array);
        });

        it('collapses a spelled-out section that turns out to be uniform', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            biomes.setSection(4, new Uint16Array(4096).fill(JUNGLE));

            expect(biomes.toSectionIds()[4 + 4]).toBe(JUNGLE);
        });

        it('refuses a section of the wrong length', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);

            expect(() => biomes.setSection(4, new Uint16Array(64))).toThrow(RangeError);
        });

        it('refuses a biome id that cannot be stored', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);

            expect(() => biomes.set(0, 0, 0, -1)).toThrow(RangeError);
            expect(() => biomes.set(0, 0, 0, 70000)).toThrow(RangeError);
        });

        it('writes a uniform section as a header and one id, with no word data', () => {
            const stream = new BinaryStream();
            new ChunkBiomes(Dimensions.Overworld).networkSerialize(stream, 1);

            // Header 1: zero bits per block, low bit set for the runtime form. Then the single
            // id as a ZigZag varint, which is 2 for plains.
            expect([...stream.getBuffer()]).toEqual([1, 2]);
        });

        it('writes a mixed section as a packed palette', () => {
            const biomes = new ChunkBiomes(Dimensions.Overworld);
            // The bottom sub chunk, which is the first section the payload carries.
            biomes.set(0, -64, 0, DESERT);

            const stream = new BinaryStream();
            biomes.networkSerialize(stream, 1);
            const buffer = stream.getBuffer();

            // One bit per block over two entries: 4096 indices in 128 words, then the palette.
            expect(buffer[0]).toBe((1 << 1) | 1);
            expect(buffer.byteLength).toBe(1 + 128 * 4 + 1 + 2);
        });
    });
});
