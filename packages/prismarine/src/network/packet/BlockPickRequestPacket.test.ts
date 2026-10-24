import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import BlockPickRequestPacket from './BlockPickRequestPacket';

describe('BlockPickRequestPacket', () => {
    it('decodes the signed position, the flag, and the slot count, consuming the whole buffer', () => {
        // Header 0x22. Position 1, -64, 3 zigzags to 2, 127 (0x7f), 6. With data. 9 slots.
        const packet = new BlockPickRequestPacket(Buffer.from([0x22, 0x02, 0x7f, 0x06, 0x01, 0x09]));
        packet.decode();

        expect(packet.position).toEqual(new BlockPosition(1, -64, 3));
        expect(packet.withData).toBe(true);
        expect(packet.maxSlots).toBe(9);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new BlockPickRequestPacket();
        packet.position = new BlockPosition(1, -64, 3);
        packet.withData = true;
        packet.maxSlots = 9;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x22, 0x02, 0x7f, 0x06, 0x01, 0x09]));
    });
});
