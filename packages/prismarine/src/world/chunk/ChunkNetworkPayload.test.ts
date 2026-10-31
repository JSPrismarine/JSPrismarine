import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { BlockEntityRegistry } from '../../blockentity/BlockEntityRegistry';
import Chunk from './Chunk';
import SubChunk from './SubChunk';
import { Dimensions, FIRST_CUSTOM_DIMENSION_ID, dimensionTypeOf, minSubChunk, subChunkCount } from '../Dimension';
import type { DimensionType } from '../Dimension';
import { VANILLA_DIMENSION_TYPES } from '../vanillaDimensionTypes';

const stone = () => BlockRuntimeIds.getByName('minecraft:stone');
const dirt = () => BlockRuntimeIds.getByName('minecraft:dirt');

/**
 * The 0..255 Overworld the server had before real world heights: shallower than the client's
 * range for dimension 0, so its payload owes the client four padding sub chunks below.
 */
const SHALLOW_OVERWORLD: DimensionType = { ...Dimensions.Overworld, minY: 0, height: 256 };

/** A small deterministic chunk: a floor, a patch of dirt, and one block well up in the air. */
const build = (dimension = SHALLOW_OVERWORLD): Chunk => {
    const chunk = new Chunk(3, -7, new Map(), dimension);
    const floor = dimension.minY;

    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
            chunk.fillColumn(x, z, floor, floor + 3, stone());
        }
    }

    chunk.setBlockRuntimeId(4, floor + 4, 9, dirt());
    chunk.setBlockRuntimeId(0, floor + 40, 0, stone());
    return chunk;
};

describe('world', () => {
    describe('chunk network payload', () => {
        it('round-trips every block through serialise and deserialise', () => {
            // This never worked before: the constructor dropped the sub chunks it was handed, and
            // the sub chunk reader took the version byte for a layer count. A chunk saved to disk
            // came back empty and the generator quietly rebuilt the terrain.
            const original = build();
            const payload = original.networkSerialize();

            const restored = Chunk.networkDeserialize(
                new BinaryStream(payload),
                original.getX(),
                original.getZ(),
                original.getNetworkSubChunkCount(),
                SHALLOW_OVERWORLD
            );

            expect(restored.getX()).toBe(3);
            expect(restored.getZ()).toBe(-7);

            const floor = SHALLOW_OVERWORLD.minY;
            const probes: Array<[number, number, number]> = [
                [0, floor, 0],
                [15, floor + 3, 15],
                [4, floor + 4, 9],
                [0, floor + 40, 0],
                [7, floor + 20, 7]
            ];
            for (const [x, y, z] of probes) {
                expect(restored.getBlockRuntimeId(x, y, z)).toBe(original.getBlockRuntimeId(x, y, z));
            }
        });

        it('reports the same sub chunk count the payload carries', () => {
            const chunk = build();
            const payload = chunk.networkSerialize();

            // Deserialising with the declared count has to consume the sub chunk section exactly,
            // leaving the biome and border trailer. A wrong count desynchronizes the stream and
            // the client renders whatever the misalignment produces.
            const stream = new BinaryStream(payload);
            Chunk.networkDeserialize(stream, 0, 0, chunk.getNetworkSubChunkCount(), SHALLOW_OVERWORLD);

            const trailer = payload.byteLength - stream.getReadIndex();
            expect(trailer).toBe(subChunkCount(Dimensions.Overworld) * 2 + 1);
        });

        it('still writes the four empty sub chunks the client expects below y=0', () => {
            // The client's world floor is -64 regardless of ours, so a dimension starting at 0
            // owes it four empty sub chunks. This used to be a hardcoded hack; it is now derived,
            // and the bytes must not have moved.
            const payload = build().networkSerialize();

            expect(payload.subarray(0, 8)).toEqual(Buffer.from([8, 0, 8, 0, 8, 0, 8, 0]));
        });

        it('writes one single-value biome section per sub chunk, then an empty border list', () => {
            // The trailer, byte for byte. Each biome section is a paletted store with
            // bitsPerBlock 0: the header is `(0 << 1) | 1`, there is no word data and no palette
            // count, and the single value follows as a ZigZag varint - plains (1) is 0x02.
            // Clearing the network flag names the on-disk palette, whose entries are NBT, and
            // writing the value unsigned turns plains into -1.
            const payload = build().networkSerialize();
            const sections = subChunkCount(Dimensions.Overworld);
            const trailer = payload.subarray(payload.byteLength - (sections * 2 + 1));

            expect([...trailer]).toEqual([...Array.from({ length: sections }, () => [0x01, 0x02]).flat(), 0x00]);
        });

        it('pads and counts biomes for the range the client gives the dimension id, not the Overworld', () => {
            // The Nether starts at 0 and is 128 tall on the client, the End 256. Padding either
            // to -64 or giving it 24 biome sections leaves the client reading biome headers as
            // sub chunks.
            for (const [dimension, sections] of [
                [Dimensions.Nether, 8],
                [Dimensions.TheEnd, 16]
            ] as const) {
                const chunk = new Chunk(0, 0, new Map(), dimension);
                chunk.setBlockRuntimeId(1, 1, 1, stone());
                const payload = chunk.networkSerialize();

                expect(chunk.getNetworkSubChunkCount()).toBe(1);
                // No padding: the first byte is the real sub chunk's version.
                expect(payload[0]).toBe(8);

                const stream = new BinaryStream(payload);
                Chunk.networkDeserialize(stream, 0, 0, 1, dimension);
                expect(payload.byteLength - stream.getReadIndex()).toBe(sections * 2 + 1);
            }
        });

        it('pads and counts biomes for the bounds a custom dimension declared, not the Overworld', () => {
            // `DimensionData` told the client this type runs from 0 to 128, so the payload has to
            // match: no padding down to -64 and 8 biome sections, not 24. The client reads any
            // extra section as the next sub chunk.
            const sky = dimensionTypeOf(
                { ...VANILLA_DIMENSION_TYPES['minecraft:overworld'], minY: 0, height: 128 },
                'mypack:sky',
                FIRST_CUSTOM_DIMENSION_ID
            );
            const chunk = new Chunk(0, 0, new Map(), sky);
            chunk.setBlockRuntimeId(1, 1, 1, stone());
            const payload = chunk.networkSerialize();

            expect(chunk.getNetworkSubChunkCount()).toBe(1);
            expect(payload[0]).toBe(8);

            const stream = new BinaryStream(payload);
            const restored = Chunk.networkDeserialize(stream, 0, 0, 1, sky);
            expect(payload.byteLength - stream.getReadIndex()).toBe(subChunkCount(sky) * 2 + 1);
            expect(restored.getBlockRuntimeId(1, 1, 1)).toBe(stone());
        });

        it('reads a version 9 sub chunk past its index byte', () => {
            // Version 9, no layers, index -4 as a signed byte, then a version 8 record with one
            // layer of air. The index byte used to be taken for the first layer's header.
            const stream = new BinaryStream(Buffer.from([9, 0, 0xfc, 8, 0]));

            const first = SubChunk.networkDeserialize(stream);
            expect(first.sourceVersion).toBe(9);
            expect(first.isEmpty()).toBe(true);
            expect(stream.getReadIndex()).toBe(3);

            expect(SubChunk.networkDeserialize(stream).sourceVersion).toBe(8);
            expect(stream.feof()).toBe(true);
        });

        it('writes each block entity as a network NBT compound after the border byte', () => {
            const chunk = build(Dimensions.Overworld);
            const tag = new NBTTagCompound('');
            tag.addValue('id', new Types.StringVal('Chest'));
            tag.addValue('x', new Types.NumberVal(49));
            tag.addValue('y', new Types.NumberVal(-60));
            tag.addValue('z', new Types.NumberVal(-110));
            tag.addValue('isMovable', new Types.ByteVal(1));
            chunk.setBlockEntity(BlockEntityRegistry.fromNBT(tag));

            const stream = new BinaryStream(chunk.networkSerialize());
            Chunk.networkDeserialize(stream, 3, -7, chunk.getNetworkSubChunkCount(), Dimensions.Overworld);
            for (let i = 0; i < subChunkCount(Dimensions.Overworld); i++) {
                expect(stream.readByte()).toBe(1);
                expect(stream.readVarInt()).toBe(1);
            }
            expect(stream.readByte()).toBe(0);

            const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
            reader.setUseVarint(true);
            const compound = reader.parse();
            expect(compound.getString('id', '')).toBe('Chest');
            expect([compound.getNumber('x', 0), compound.getNumber('y', 0), compound.getNumber('z', 0)]).toEqual([
                49, -60, -110
            ]);
            expect(stream.feof()).toBe(true);
        });

        it('rebuilds the payload when a block entity comes or goes', () => {
            // The mutation count only sees block writes, so the cache has to be dropped by hand.
            const chunk = build(Dimensions.Overworld);
            const before = chunk.networkSerialize();

            const tag = new NBTTagCompound('');
            tag.addValue('id', new Types.StringVal('Chest'));
            tag.addValue('x', new Types.NumberVal(48));
            tag.addValue('y', new Types.NumberVal(-60));
            tag.addValue('z', new Types.NumberVal(-112));
            chunk.setBlockEntity(BlockEntityRegistry.fromNBT(tag));
            expect(chunk.networkSerialize().byteLength).toBeGreaterThan(before.byteLength);

            chunk.removeBlockEntity(48, -60, -112);
            expect(chunk.networkSerialize().equals(before)).toBe(true);
        });

        it('caches the payload until a block changes', () => {
            const chunk = build();
            const first = chunk.networkSerialize();

            expect(chunk.networkSerialize()).toBe(first);

            chunk.setBlockRuntimeId(1, SHALLOW_OVERWORLD.minY + 1, 1, dirt());
            expect(chunk.networkSerialize()).not.toBe(first);
        });

        it('serialises an empty chunk to nothing but the trailer', () => {
            const chunk = new Chunk(0, 0, new Map(), SHALLOW_OVERWORLD);

            // Four padding sub chunks, then the biomes and the border byte.
            expect(chunk.networkSerialize().byteLength).toBe(8 + subChunkCount(Dimensions.Overworld) * 2 + 1);
            expect(chunk.getSubChunkCount()).toBe(0);
        });
    });

    describe('chunk vertical bounds', () => {
        it('derives its range from the dimension', () => {
            const overworld = new Chunk(0, 0, new Map(), Dimensions.Overworld);

            expect(overworld.getMinY()).toBe(-64);
            expect(overworld.getMaxY()).toBe(319);
            expect(minSubChunk(Dimensions.Overworld)).toBe(-4);
            expect(subChunkCount(Dimensions.Overworld)).toBe(24);
        });

        it('places and reads a block below y=0 in a dimension that has one', () => {
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(8, -60, 8, stone());

            expect(chunk.getBlockRuntimeId(8, -60, 8)).toBe(stone());
            expect(chunk.getSubChunk(-4)).not.toBeNull();
        });

        it('reads outside the dimension as air rather than throwing', () => {
            const chunk = new Chunk(0, 0, new Map(), SHALLOW_OVERWORLD);

            expect(chunk.getBlockRuntimeId(0, -1, 0)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
            expect(chunk.getBlockRuntimeId(0, 999, 0)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
        });

        it('refuses to place a block outside the dimension', () => {
            // Silently dropping the write would surface much later as a hole in the terrain.
            const chunk = new Chunk(0, 0, new Map(), SHALLOW_OVERWORLD);

            expect(() => chunk.setBlockRuntimeId(0, -1, 0, stone())).toThrow(/spans 0 to 255/);
            expect(() => chunk.setBlockRuntimeId(0, 256, 0, stone())).toThrow(/spans 0 to 255/);
        });

        it('refuses a sub chunk index outside the dimension', () => {
            const chunk = new Chunk(0, 0, new Map(), SHALLOW_OVERWORLD);

            // 16 used to be accepted, one past the top.
            expect(() => chunk.getSubChunk(16)).toThrow(/Invalid subchunk height/);
            expect(() => chunk.getSubChunk(-1)).toThrow(/Invalid subchunk height/);
        });

        it('reports no highest block for an empty column', () => {
            // Null, not -1: with a floor below zero, -1 is a height a real block can sit at.
            expect(new Chunk(0, 0, new Map(), Dimensions.Overworld).getHighestBlockAt(0, 0)).toBeNull();
        });

        it('finds the highest block under a floor below zero', () => {
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
            chunk.setBlockRuntimeId(2, -61, 3, stone());

            expect(chunk.getHighestBlockAt(2, 3)).toBe(-61);
        });
    });
});
