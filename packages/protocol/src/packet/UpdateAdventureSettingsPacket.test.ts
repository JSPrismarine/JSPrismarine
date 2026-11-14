import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import { layoutAt } from '../wire/WireLayout';
import { updateAdventureSettingsPacket } from '../wire/definitions/worldStatus';
import UpdateAdventureSettingsPacket from './UpdateAdventureSettingsPacket';
import type { UpdateAdventureSettingsPayload } from './UpdateAdventureSettingsPacket';
import { capture } from '../testing/evidence.test.helper';

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

describe.each([2193, 2225])('the UpdateAdventureSettings layout at protocol %i', (protocol) => {
    const layout = layoutAt(updateAdventureSettingsPacket, protocol);

    it('round-trips the packet a real Bedrock Dedicated Server sent', () => {
        const captured = capture(protocol, 0xbc);
        const stream = new BinaryStream();
        layout.encode(stream, layout.decode(new BinaryStream(captured)));

        expect(stream.getBuffer()).toEqual(captured);
    });
});
