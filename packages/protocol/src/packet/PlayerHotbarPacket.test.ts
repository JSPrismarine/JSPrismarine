import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import PlayerHotbarPacket from './PlayerHotbarPacket';
import type { PlayerHotbarPayload } from './PlayerHotbarPacket';

const payload: PlayerHotbarPayload = {
    selectedSlot: 3,
    containerId: 0,
    shouldSelectSlot: true
};

// Header 0x30, slot 3, player inventory container 0, and selection enabled.
const wire = Buffer.from([0x30, 0x03, 0x00, 0x01]);

describe('PlayerHotbarPacket', () => {
    it('encodes the selected slot, container, and selection flag', () => {
        const packet = new PlayerHotbarPacket(payload);
        packet.encode();

        expect(packet.getBuffer()).toEqual(wire);
    });

    it('decodes a packet buffer', () => {
        const packet = new PlayerHotbarPacket(wire);
        packet.decode();

        expect(packet.getPacketData()).toEqual(payload);
    });

    it('uses the expected network identifier', () => {
        expect(new PlayerHotbarPacket(payload).getId()).toBe(PacketIdentifier.PLAYER_HOTBAR);
    });
});
