import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import UpdateAdventureSettingsPacket from './UpdateAdventureSettingsPacket';
import type { UpdateAdventureSettingsPayload } from './UpdateAdventureSettingsPacket';

const payload: UpdateAdventureSettingsPayload = {
    noAttackingMobs: true,
    noAttackingPlayers: false,
    worldImmutable: true,
    showNameTags: false,
    autoJump: true
};

// Header varuint 188, then the five booleans in docs order.
const wire = Buffer.from([0xbc, 0x01, 0x01, 0x00, 0x01, 0x00, 0x01]);

describe('UpdateAdventureSettingsPacket', () => {
    it('encodes the five settings in docs order', () => {
        const packet = new UpdateAdventureSettingsPacket(payload);
        packet.encode();

        expect(packet.getBuffer()).toEqual(wire);
    });

    it('decodes a packet buffer', () => {
        const packet = new UpdateAdventureSettingsPacket(wire);
        packet.decode();

        expect(packet.getPacketData()).toEqual(payload);
    });

    it('uses the expected network identifier', () => {
        expect(new UpdateAdventureSettingsPacket(payload).getId()).toBe(PacketIdentifier.UPDATE_ADVENTURE_SETTINGS);
    });
});
