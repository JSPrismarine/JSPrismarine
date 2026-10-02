import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import Chunk from './Chunk';
import { Dimensions, minSubChunk, subChunkCount } from '../Dimension';

const stone = () => BlockRuntimeIds.getByName('minecraft:stone');
const dirt = () => BlockRuntimeIds.getByName('minecraft:dirt');

/** A small deterministic chunk: a floor, a patch of dirt, and one block well up in the air. */
const build = (dimension = Dimensions.Legacy): Chunk => {
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
                Dimensions.Legacy
            );

            expect(restored.getX()).toBe(3);
            expect(restored.getZ()).toBe(-7);

            const floor = Dimensions.Legacy.minY;
            for (const [x, y, z] of [
                [0, floor, 0],
                [15, floor + 3, 15],
                [4, floor + 4, 9],
                [0, floor + 40, 0],
                [7, floor + 20, 7]
            ] as Array<[number, number, number]>) {
                expect(restored.getBlockRuntimeId(x, y, z)).toBe(original.getBlockRuntimeId(x, y, z));
            }
        });

        it('reports the same sub chunk count the payload carries', () => {
            const chunk = build();
            const payload = chunk.networkSerialize();

            // Deserialising with the declared count has to consume the sub chunk section exactly,
            // leaving the biome and border trailer. A wrong count desynchronises the stream and
            // the client renders whatever the misalignment produces.
            const stream = new BinaryStream(payload);
            Chunk.networkDeserialize(stream, 0, 0, chunk.getNetworkSubChunkCount(), Dimensions.Legacy);

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

        it('caches the payload until a block changes', () => {
            const chunk = build();
            const first = chunk.networkSerialize();

            expect(chunk.networkSerialize()).toBe(first);

            chunk.setBlockRuntimeId(1, Dimensions.Legacy.minY + 1, 1, dirt());
            expect(chunk.networkSerialize()).not.toBe(first);
        });

        it('serialises an empty chunk to nothing but the trailer', () => {
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Legacy);

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
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Legacy);

            expect(chunk.getBlockRuntimeId(0, -1, 0)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
            expect(chunk.getBlockRuntimeId(0, 999, 0)).toBe(BlockRuntimeIds.getByName('minecraft:air'));
        });

        it('refuses to place a block outside the dimension', () => {
            // Silently dropping the write would surface much later as a hole in the terrain.
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Legacy);

            expect(() => chunk.setBlockRuntimeId(0, -1, 0, stone())).toThrow(/spans 0 to 255/);
            expect(() => chunk.setBlockRuntimeId(0, 256, 0, stone())).toThrow(/spans 0 to 255/);
        });

        it('refuses a sub chunk index outside the dimension', () => {
            const chunk = new Chunk(0, 0, new Map(), Dimensions.Legacy);

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
