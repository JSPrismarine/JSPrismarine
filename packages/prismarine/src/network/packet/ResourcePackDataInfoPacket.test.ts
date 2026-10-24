import { describe, expect, it } from 'vitest';
import ResourcePackDataInfoPacket, { ResourcePackType } from './ResourcePackDataInfoPacket';

describe('ResourcePackDataInfoPacket', () => {
    const hash = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    // One Buffer per docs field, in wire order.
    const encoded = Buffer.concat([
        Buffer.from([0x52]), // Header, packet 82
        Buffer.from([0x03]),
        Buffer.from('abc'), // Resource Name
        Buffer.from([0x00, 0x00, 0x10, 0x00]), // Chunk Size: uint32 LE 1048576
        Buffer.from([0x02, 0x00, 0x00, 0x00]), // Number of Chunks: uint32 LE 2
        Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // File Size: uint64 LE 3
        Buffer.from([0x04]),
        hash, // File Hash
        Buffer.from([0x00]), // Is Premium Pack
        Buffer.from([0x06]) // Pack Type: Resources
    ]);

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new ResourcePackDataInfoPacket(encoded);
        packet.decode();

        expect(packet.resourceName).toBe('abc');
        expect(packet.chunkSize).toBe(1048576);
        expect(packet.numberOfChunks).toBe(2);
        expect(packet.fileSize).toBe(3n);
        expect(packet.fileHash).toEqual(hash);
        expect(packet.isPremiumPack).toBe(false);
        expect(packet.packType).toBe(ResourcePackType.Resources);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new ResourcePackDataInfoPacket();
        packet.resourceName = 'abc';
        packet.chunkSize = 1048576;
        packet.numberOfChunks = 2;
        packet.fileSize = 3n;
        packet.fileHash = hash;
        packet.packType = ResourcePackType.Resources;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it("numbers the pack types as Mojang's PackType enum does", () => {
        expect(ResourcePackType.Invalid).toBe(0);
        expect(ResourcePackType.Addon).toBe(1);
        expect(ResourcePackType.Resources).toBe(6);
        expect(ResourcePackType.WorldTemplate).toBe(8);
    });
});
