import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import Chunk from '../world/chunk/Chunk';
import { ClientBlobCache } from './ClientBlobCache';
import { xxHash64 } from './xxHash64';

describe('ClientBlobCache', () => {
    it('keeps missing blobs per session until the client acknowledges them', () => {
        const chunk = new Chunk();
        chunk.setBlockRuntimeId(1, -64, 1, BlockRuntimeIds.getByName('minecraft:stone'));
        const firstSession = new ClientBlobCache();
        const secondSession = new ClientBlobCache();
        const prepared = firstSession.prepareChunk(chunk);
        const requested = prepared.blobs[0]!;
        expect(prepared.blobHashes).toEqual(prepared.blobs.map(({ id }) => id));
        expect(prepared.blobs.every(({ id, data }) => xxHash64(data) === id)).toBe(true);
        expect(prepared.blobs).toHaveLength(chunk.getNetworkSubChunkCount() + 1);
        firstSession.track(prepared.blobs);
        const pendingBytes = firstSession.pendingBytes;

        expect(firstSession.respond([requested.id, 123n], [])).toEqual([
            { blobId: requested.id, blobData: requested.data }
        ]);
        expect(firstSession.pendingBytes).toBeGreaterThan(0);
        expect(secondSession.respond([requested.id], [])).toEqual([]);

        expect(firstSession.respond([requested.id], [requested.id])).toEqual([
            { blobId: requested.id, blobData: requested.data }
        ]);
        expect(firstSession.pendingBytes).toBeGreaterThan(0);

        firstSession.respond([], [requested.id]);
        expect(firstSession.pendingBytes).toBe(pendingBytes - requested.data.byteLength);
    });

    it('reuses unchanged subchunk and biome blobs after a different section changes', () => {
        const chunk = new Chunk();
        chunk.setBlockRuntimeId(1, -64, 1, BlockRuntimeIds.getByName('minecraft:stone'));
        chunk.setBlockRuntimeId(2, 0, 2, BlockRuntimeIds.getByName('minecraft:stone'));
        const cache = new ClientBlobCache();
        const before = cache.prepareChunk(chunk);

        chunk.setBlockRuntimeId(3, 0, 3, BlockRuntimeIds.getByName('minecraft:dirt'));
        const after = cache.prepareChunk(chunk);

        expect(after.blobs[0]).toBe(before.blobs[0]);
        expect(after.blobs[4]).not.toBe(before.blobs[4]);
        expect(after.blobs.at(-1)).toBe(before.blobs.at(-1));
    });
});
