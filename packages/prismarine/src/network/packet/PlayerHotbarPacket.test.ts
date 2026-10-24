import { describe, expect, it } from 'vitest';
import PlayerHotbarPacket from './PlayerHotbarPacket';

describe('PlayerHotbarPacket', () => {
    // Header 0x30. Slot 3, container 0 (the player inventory), and the selection flag set.
    const encoded = Buffer.from([0x30, 0x03, 0x00, 0x01]);

    it('decodes the slot, container and flag, consuming the whole buffer', () => {
        const packet = new PlayerHotbarPacket(encoded);
        packet.decode();

        expect(packet.selectedSlot).toBe(3);
        expect(packet.containerId).toBe(0);
        expect(packet.shouldSelectSlot).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the selection back to the same bytes', () => {
        const packet = new PlayerHotbarPacket();
        packet.selectedSlot = 3;
        packet.containerId = 0;
        packet.shouldSelectSlot = true;
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });
});
