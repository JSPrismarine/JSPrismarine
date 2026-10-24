import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';
import ServerPlayerPostMovePositionPacket from './ServerPlayerPostMovePositionPacket';

describe('ServerPlayerPostMovePositionPacket', () => {
    // Header 0x10, then 1.5, -2 and 3.25 as little-endian floats.
    const encoded = Buffer.from([0x10, 0x00, 0x00, 0xc0, 0x3f, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x50, 0x40]);

    it('decodes the position, consuming the whole buffer', () => {
        const packet = new ServerPlayerPostMovePositionPacket(encoded);
        packet.decode();

        expect(packet.pos).toEqual(new Vector3(1.5, -2, 3.25));
        expect(packet.feof()).toBe(true);
    });

    it('encodes the position back to the same bytes', () => {
        const packet = new ServerPlayerPostMovePositionPacket();
        packet.pos = new Vector3(1.5, -2, 3.25);
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
