import { LevelChunkPacket, NetworkBinaryStream } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import ServerLevelChunkPacket from './packet/LevelChunkPacket';

/**
 * The LevelChunk envelope is pinned against the server's implementation while both versions
 * coexist, including its opaque payload and subchunk request sentinel.
 */

describe('LevelChunk', () => {
    it('reads the envelope the server writes and leaves the terrain alone', () => {
        const payload = Buffer.alloc(4096, 0x2a);

        const server = new ServerLevelChunkPacket();
        server.chunkX = -3;
        server.chunkZ = 7;
        server.subChunkCount = 5;
        server.clientSubChunkRequestsEnabled = false;
        server.data = payload;
        server.encode();

        const decoded = new LevelChunkPacket().deserialize(new NetworkBinaryStream(server.getBuffer()));

        expect(decoded.chunkX).toBe(-3);
        expect(decoded.chunkZ).toBe(7);
        expect(decoded.subChunkCount).toBe(5);
        expect(decoded.clientSubChunkRequestsEnabled).toBe(false);
        // Not parsed, just handed over - which is the whole point for a load test.
        expect(decoded.payload.equals(payload)).toBe(true);
    });

    it('recognizes the sub chunk request sentinel rather than reading it as a count', () => {
        const server = new ServerLevelChunkPacket();
        server.chunkX = 0;
        server.chunkZ = 0;
        server.subChunkCount = 9;
        server.clientSubChunkRequestsEnabled = true;
        server.data = Buffer.alloc(8);
        server.encode();

        const decoded = new LevelChunkPacket().deserialize(new NetworkBinaryStream(server.getBuffer()));

        expect(decoded.clientSubChunkRequestsEnabled).toBe(true);
        expect(decoded.subChunkCount).toBe(9);
    });
});
