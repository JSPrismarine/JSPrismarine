import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import LecternUpdatePacket from './LecternUpdatePacket';

describe('LecternUpdatePacket', () => {
    it('decodes the pages and the signed block position, consuming the whole buffer', () => {
        // Header 0x7d. Page 2 of 5. Position 1, 64, -3 zigzags to 2, 128 (0x80 0x01), 5.
        const packet = new LecternUpdatePacket(Buffer.from([0x7d, 0x02, 0x05, 0x02, 0x80, 0x01, 0x05]));
        packet.decode();

        expect(packet.newPage).toBe(2);
        expect(packet.totalPages).toBe(5);
        expect(packet.position).toEqual(new BlockPosition(1, 64, -3));
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new LecternUpdatePacket();
        packet.newPage = 2;
        packet.totalPages = 5;
        packet.position = new BlockPosition(1, 64, -3);
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x7d, 0x02, 0x05, 0x02, 0x80, 0x01, 0x05]));
    });
});
