import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { layoutAt } from '../wire/WireLayout';
import { levelChunkPacket } from '../wire/definitions/levelChunk';
import LevelChunkPacket from './LevelChunkPacket';

import type { LevelChunk } from './LevelChunkPacket';

const plain: LevelChunk = {
    chunkX: 4,
    chunkZ: -3,
    dimension: 1,
    subChunkCount: 2,
    clientSubChunkRequestsEnabled: false,
    cached: false,
    payload: Buffer.from([1, 2, 3]),
    isClientBiomeUpdate: true
};

const layoutPayload = (data: LevelChunk) => ({
    chunkX: data.chunkX,
    chunkZ: data.chunkZ,
    dimension: data.dimension,
    subChunkRequest: { clientRequestsEnabled: data.clientSubChunkRequestsEnabled, count: data.subChunkCount },
    cacheEnabled: data.cached,
    cacheBlobIds: data.blobHashes ?? [],
    data: data.payload,
    isClientBiomeUpdate: data.isClientBiomeUpdate ?? false
});

const packetPayload = (data: LevelChunk, protocolVersion: number): Buffer =>
    new LevelChunkPacket(data).serialize(new NetworkBinaryStream(), { protocolVersion }).subarray(1);

describe('the declarative LevelChunk layout', () => {
    it('matches the packet class for a plain chunk', () => {
        const expected = new NetworkBinaryStream();
        layoutAt(levelChunkPacket, 2193).encode(expected, layoutPayload(plain));

        expect(packetPayload(plain, 2193)).toEqual(expected.getBuffer());
    });

    it('matches the packet class in sub-chunk request mode', () => {
        const request = { ...plain, clientSubChunkRequestsEnabled: true, subChunkCount: 9 };
        const expected = new NetworkBinaryStream();
        layoutAt(levelChunkPacket, 2193).encode(expected, layoutPayload(request));

        expect(packetPayload(request, 2193)).toEqual(expected.getBuffer());
    });

    it('appends exactly the trailing Is Client Biome Update boolean at 2225', () => {
        const base = new NetworkBinaryStream();
        layoutAt(levelChunkPacket, 2193).encode(base, layoutPayload(plain));

        const extended = new NetworkBinaryStream();
        layoutAt(levelChunkPacket, 2225).encode(extended, layoutPayload(plain));

        expect(extended.getBuffer()).toEqual(Buffer.concat([base.getBuffer(), Buffer.from([1])]));
        expect(packetPayload(plain, 2225)).toEqual(extended.getBuffer());
    });

    it('decodes the fields the packet class encoded', () => {
        const encoded = packetPayload(plain, 2193);
        const read = layoutAt(levelChunkPacket, 2193).decode(new NetworkBinaryStream(encoded));

        expect(read).toEqual({ ...layoutPayload(plain), isClientBiomeUpdate: false });
    });
});
