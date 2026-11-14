import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import { playerHotbarPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import PlayerHotbarPacket from './PlayerHotbarPacket';
import type { PlayerHotbarPayload } from './PlayerHotbarPacket';
import { capture } from '../testing/evidence.test.helper';

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

    // Both pages (1.26.50 and 1.26.60) print the same three fields and no changelog rows.
    it.each([2193, 2225])('round-trips the Bedrock Dedicated Server capture at protocol %i', (protocol) => {
        const bytes = capture(protocol, 0x30);
        const layout = layoutAt(playerHotbarPacket, protocol);
        const stream = new BinaryStream(bytes);
        const decoded = layout.decode(stream);

        expect(stream.feof()).toBe(true);
        const encoded = new BinaryStream();
        layout.encode(encoded, decoded);
        expect(encoded.getBuffer().equals(bytes)).toBe(true);
    });
});
