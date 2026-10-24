import { describe, expect, it } from 'vitest';
import PlayerToggleCrafterSlotRequestPacket from './PlayerToggleCrafterSlotRequestPacket';

describe('PlayerToggleCrafterSlotRequestPacket', () => {
    // Header: id 306 as LEB128 is 0xb2 0x02.
    it('decodes three int32 LE coordinates, the slot, and the flag, consuming the whole buffer', () => {
        const packet = new PlayerToggleCrafterSlotRequestPacket(
            Buffer.from([
                0xb2,
                0x02,
                0x01,
                0x00,
                0x00,
                0x00, // x 1
                0x40,
                0x00,
                0x00,
                0x00, // y 64
                0xfd,
                0xff,
                0xff,
                0xff, // z -3
                0x08, // slot 8
                0x01 // disabled
            ])
        );
        packet.decode();

        expect(packet.posX).toBe(1);
        expect(packet.posY).toBe(64);
        expect(packet.posZ).toBe(-3);
        expect(packet.slotIndex).toBe(8);
        expect(packet.isDisabled).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new PlayerToggleCrafterSlotRequestPacket();
        packet.posX = 1;
        packet.posY = 64;
        packet.posZ = -3;
        packet.slotIndex = 8;
        packet.isDisabled = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([0xb2, 0x02, 0x01, 0, 0, 0, 0x40, 0, 0, 0, 0xfd, 0xff, 0xff, 0xff, 0x08, 0x01])
        );
    });
});
