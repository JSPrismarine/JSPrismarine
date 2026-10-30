import { describe, expect, it } from 'vitest';
import ResourcePackChunkDataPacket from './ResourcePackChunkDataPacket';

describe('ResourcePackChunkDataPacket', () => {
    const chunk = Buffer.from([0x01, 0x02, 0x03]);

    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x53]), // Header, packet 83
        Buffer.from([0x03]),
        Buffer.from('abc'), // Resource Name
        Buffer.from([0x01, 0x00, 0x00, 0x00]), // Chunk ID: uint32 LE 1
        Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // Byte Offset: uint64 LE 256
        Buffer.from([0x03]),
        chunk // Chunk Data
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new ResourcePackChunkDataPacket(encoded);
        packet.decode();

        expect(packet.resourceName).toBe('abc');
        expect(packet.chunkId).toBe(1);
        expect(packet.byteOffset).toBe(256n);
        expect(packet.chunkData).toEqual(chunk);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new ResourcePackChunkDataPacket();
        packet.resourceName = 'abc';
        packet.chunkId = 1;
        packet.byteOffset = 256n;
        packet.chunkData = chunk;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
