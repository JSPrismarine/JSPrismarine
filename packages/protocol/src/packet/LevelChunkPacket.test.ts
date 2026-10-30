import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import LevelChunkPacket from './LevelChunkPacket';

import type { LevelChunk } from './LevelChunkPacket';

const payload = Buffer.from([0x2a, 0x2b, 0x2c]);

const packetData = (overrides: Partial<LevelChunk> = {}): LevelChunk => ({
    chunkX: -3,
    chunkZ: 7,
    dimension: 1,
    subChunkCount: 5,
    clientSubChunkRequestsEnabled: false,
    cached: false,
    payload,
    ...overrides
});

const payloadBytes = (data: LevelChunk, protocolVersion = 2193): number[] => {
    const stream = new NetworkBinaryStream();
    new LevelChunkPacket(data).serialize(stream, { protocolVersion });

    const packet = new NetworkBinaryStream(stream.getBuffer());
    expect(packet.readUnsignedVarInt()).toBe(PacketIdentifier.LEVEL_CHUNK);

    const bytes = [...packet.readRemaining()];
    expect(packet.feof()).toBe(true);
    return bytes;
};

const decode = (body: number[], protocolVersion = 2193): LevelChunk => {
    const stream = new NetworkBinaryStream(Buffer.from([PacketIdentifier.LEVEL_CHUNK, ...body]));
    const data = new LevelChunkPacket().deserialize(stream, { protocolVersion });
    expect(stream.feof()).toBe(true);
    return data;
};

const roundTrip = (data: LevelChunk, protocolVersion = 2193): LevelChunk => {
    const stream = new NetworkBinaryStream();
    new LevelChunkPacket(data).serialize(stream, { protocolVersion });
    return new LevelChunkPacket().deserialize(new NetworkBinaryStream(stream.getBuffer()), { protocolVersion });
};

describe('LevelChunkPacket', () => {
    it('writes the plain-mode envelope in documented field order', () => {
        expect(payloadBytes(packetData())).toEqual([
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
        ]);
    });

    it('writes a zero count and request limit in sub-chunk request mode', () => {
        expect(payloadBytes(packetData({ clientSubChunkRequestsEnabled: true, subChunkCount: 9 }))).toEqual([
            0x05,
            0x0e,
            0x02,
            0x00, // Sub-chunks Count is zero in request mode
            0x01, // Client Request SubChunk Limit present
            0x12, // ZigZag(9)
            0x00,
            0x00,
            0x03,
            0x2a,
            0x2b,
            0x2c
        ]);
    });

    it('writes cache metadata blob ids as little-endian uint64 values', () => {
        expect(
            payloadBytes(
                packetData({
                    clientSubChunkRequestsEnabled: true,
                    subChunkCount: 9,
                    cached: true,
                    blobHashes: [1n, 0xffffffffffffffffn],
                    payload: Buffer.alloc(0)
                })
            )
        ).toEqual([
            0x05,
            0x0e,
            0x02,
            0x00,
            0x01,
            0x12,
            0x01, // Cache Enabled true
            0x02, // Two Blob Ids
            0x01,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00, // Blob Id 1
            0xff,
            0xff,
            0xff,
            0xff,
            0xff,
            0xff,
            0xff,
            0xff, // Blob Id 2^64 - 1
            0x00 // Serialized Chunk Data length
        ]);
    });

    it('writes the Overworld dimension when its value is zero', () => {
        expect(
            payloadBytes(packetData({ chunkX: 0, chunkZ: 0, dimension: 0, subChunkCount: 0, payload: Buffer.alloc(0) }))
        ).toEqual([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    });

    it('round-trips a plain chunk, where the count is a count', () => {
        const input = packetData({ chunkX: -5, chunkZ: 12, subChunkCount: 6 });

        expect(roundTrip(input)).toEqual({ ...input, blobHashes: [] });
    });

    it('round-trips request mode, where the count becomes the request limit', () => {
        const input = packetData({
            chunkX: 3,
            chunkZ: -7,
            subChunkCount: 24,
            clientSubChunkRequestsEnabled: true,
            payload: Buffer.alloc(0)
        });

        expect(roundTrip(input)).toEqual({ ...input, blobHashes: [] });
    });

    it('decodes hand-built plain and cached request-mode payloads', () => {
        expect(decode([0x05, 0x0e, 0x02, 0x05, 0x00, 0x00, 0x00, 0x03, 0x2a, 0x2b, 0x2c])).toEqual({
            chunkX: -3,
            chunkZ: 7,
            dimension: 1,
            subChunkCount: 5,
            clientSubChunkRequestsEnabled: false,
            cached: false,
            blobHashes: [],
            payload
        });

        expect(
            decode([
                0x05, 0x0e, 0x02, 0x00, 0x01, 0x12, 0x01, 0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
                0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00
            ])
        ).toEqual({
            chunkX: -3,
            chunkZ: 7,
            dimension: 1,
            subChunkCount: 9,
            clientSubChunkRequestsEnabled: true,
            cached: true,
            blobHashes: [1n, 0xffffffffffffffffn],
            payload: Buffer.alloc(0)
        });
    });

    it('round-trips the versioned biome update field starting at protocol 2225', () => {
        const input = packetData({ isClientBiomeUpdate: true });

        expect(roundTrip(input, 2225)).toEqual({ ...input, blobHashes: [] });
        expect(payloadBytes(input, 2225).at(-1)).toBe(1);
    });
});
