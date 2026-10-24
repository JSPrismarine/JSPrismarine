import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import AnvilDamagePacket from './AnvilDamagePacket';

describe('AnvilDamagePacket', () => {
    // Header: id 141 as LEB128 is 0x8d 0x01.
    it('decodes the signed block position and consumes the whole buffer', () => {
        // Position -1, 70, 2 zigzags to 1, 140 (0x8c 0x01), 4.
        const packet = new AnvilDamagePacket(Buffer.from([0x8d, 0x01, 0x01, 0x8c, 0x01, 0x04]));
        packet.decode();

        expect(packet.blockPosition).toEqual(new BlockPosition(-1, 70, 2));
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new AnvilDamagePacket();
        packet.blockPosition = new BlockPosition(-1, 70, 2);
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x8d, 0x01, 0x01, 0x8c, 0x01, 0x04]));
    });
});
