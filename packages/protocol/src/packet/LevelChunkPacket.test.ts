import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import LevelChunkPacket from './LevelChunkPacket';

// Header 0x3a (id 58). ZigZag(n) is (n << 1) ^ (n >> 31): -3 gives 0x05, 7 gives 0x0e, 1 gives
// 0x02, 9 gives 0x12.
const plain = [
    0x3a,
    0x05, // Chunk Position X, ZigZag(-3)
    0x0e, // Chunk Position Z, ZigZag(7)
    0x02, // Dimension Id, ZigZag(1)
    0x05, // Sub-chunks Count
    0x00, // Client Request SubChunk Limit absent
    0x00, // Cache Enabled false
    0x00, // Cache Metadata, empty
    0x03, // Serialized Chunk Data length
    0x2a,
    0x2b,
    0x2c
];

const requestMode = [
    0x3a,
    0x05,
    0x0e,
    0x02,
    0x00, // Sub-chunks Count, always 0 in request mode
    0x01, // Client Request SubChunk Limit present
    0x12, // Client Request SubChunk Limit, ZigZag(9)
    0x01, // Cache Enabled true
    0x02, // Cache Metadata, two Blob Ids
    0x01,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // Blob Id 1, uint64 LE
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff,
    0xff, // Blob Id 2^64 - 1
    0x00 // Serialized Chunk Data, empty
];

describe('LevelChunkPacket', () => {
    it('writes the plain-mode envelope in docs order', () => {
        const buffer = new LevelChunkPacket({
            chunkX: -3,
            chunkZ: 7,
            dimension: 1,
            subChunkCount: 5,
            clientSubChunkRequestsEnabled: false,
            cached: false,
            payload: Buffer.from([0x2a, 0x2b, 0x2c])
        }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual(plain);
    });

    it('writes a zero count, the limit and the blob hashes in request mode', () => {
        const buffer = new LevelChunkPacket({
            chunkX: -3,
            chunkZ: 7,
            dimension: 1,
            subChunkCount: 9,
            clientSubChunkRequestsEnabled: true,
            cached: true,
            blobHashes: [1n, 0xffffffffffffffffn],
            payload: Buffer.alloc(0)
        }).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual(requestMode);
    });

    it('reads both hand-built buffers to their end', () => {
        const plainStream = new NetworkBinaryStream(Buffer.from(plain));
        expect(new LevelChunkPacket().deserialize(plainStream)).toEqual({
            chunkX: -3,
            chunkZ: 7,
            dimension: 1,
            subChunkCount: 5,
            clientSubChunkRequestsEnabled: false,
            cached: false,
            blobHashes: [],
            payload: Buffer.from([0x2a, 0x2b, 0x2c])
        });
        expect(plainStream.feof()).toBe(true);

        const requestStream = new NetworkBinaryStream(Buffer.from(requestMode));
        expect(new LevelChunkPacket().deserialize(requestStream)).toEqual({
            chunkX: -3,
            chunkZ: 7,
            dimension: 1,
            subChunkCount: 9,
            clientSubChunkRequestsEnabled: true,
            cached: true,
            blobHashes: [1n, 0xffffffffffffffffn],
            payload: Buffer.alloc(0)
        });
        expect(requestStream.feof()).toBe(true);
    });
});
