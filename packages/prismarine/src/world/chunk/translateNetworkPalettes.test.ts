import BinaryStream from '@jsprismarine/binaryutils';
import { blockRuntimeId } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import { blockTranslationFor } from '../../network/codec/blockTranslation';
import { Dimensions } from '../DimensionType';
import Chunk from './Chunk';
import SubChunk from './SubChunk';
import { translateChunkPayload } from './translateNetworkPalettes';

const at2193 = blockTranslationFor(2193).toClient;

/** The block ids of every storage of each sub chunk a payload opens with. */
const idsIn = (payload: Buffer, subChunkCount: number): number[][] => {
    const stream = new BinaryStream(payload);
    const ids: number[][] = [];
    for (let index = 0; index < subChunkCount; index++) {
        const subChunk = SubChunk.networkDeserialize(stream);
        const seen = new Set<number>();
        for (let x = 0; x < 16; x++)
            for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) seen.add(subChunk.getBlockRuntimeId(x, y, z) | 0);
        ids.push([...seen].sort((a, b) => a - b));
    }
    return ids;
};

describe('translateChunkPayload', () => {
    it('rewrites a palette for an older release and leaves the rest of the payload as it was', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        const fire = BlockRuntimeIds.tryGetByState('minecraft:fire', { age: 2, 'minecraft:connection_up': true })!;
        const stone = BlockRuntimeIds.getByName('minecraft:stone');
        chunk.setBlockRuntimeId(1, -64, 1, stone);
        chunk.setBlockRuntimeId(1, -63, 1, fire);
        const payload = chunk.networkSerialize();
        const count = chunk.getNetworkSubChunkCount();

        const translated = translateChunkPayload(payload, count, at2193);

        const [first] = idsIn(translated, count);
        expect(first).toContain(blockRuntimeId('minecraft:fire', { age: 2 }));
        expect(first).toContain(stone);
        expect(first).not.toContain(fire);
        // The biomes and everything after them are copied byte for byte.
        const tail = (bytes: Buffer): Buffer => {
            const stream = new BinaryStream(bytes);
            for (let index = 0; index < count; index++) SubChunk.networkDeserialize(stream);
            return stream.readRemaining();
        };
        expect(tail(translated)).toEqual(tail(payload));
    });

    it('hands back the same buffer when no block changes', () => {
        const chunk = new Chunk(0, 0, new Map(), Dimensions.Overworld);
        chunk.setBlockRuntimeId(1, -64, 1, BlockRuntimeIds.getByName('minecraft:stone'));
        const payload = chunk.networkSerialize();

        expect(translateChunkPayload(payload, chunk.getNetworkSubChunkCount(), at2193)).toBe(payload);
    });
});
