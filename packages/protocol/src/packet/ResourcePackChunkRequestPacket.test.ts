import { describe, expect, it } from 'vitest';
import ResourcePackChunkRequestPacket from './ResourcePackChunkRequestPacket';

describe('ResourcePackChunkRequestPacket', () => {
    it('decodes the name and the int32 LE chunk index, consuming the whole buffer', () => {
        // Header 0x54. "ab_1" is 4 bytes. Chunk 258 little endian.
        const packet = new ResourcePackChunkRequestPacket(
            Buffer.from([0x54, 0x04, 0x61, 0x62, 0x5f, 0x31, 0x02, 0x01, 0x00, 0x00])
        );
        packet.decode();

        expect(packet.resourceName).toBe('ab_1');
        expect(packet.chunk).toBe(258);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new ResourcePackChunkRequestPacket();
        packet.resourceName = 'ab_1';
        packet.chunk = 258;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x54, 0x04, 0x61, 0x62, 0x5f, 0x31, 0x02, 0x01, 0x00, 0x00]));
    });
});
