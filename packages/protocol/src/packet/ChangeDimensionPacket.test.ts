import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { PacketIdentifier } from '../PacketIdentifier';
import ChangeDimensionPacket from './ChangeDimensionPacket';
import type { ChangeDimensionPayload } from './ChangeDimensionPacket';

const withoutScreen: ChangeDimensionPayload = {
    dimension: 1,
    position: new Vector3(0, 64, 0),
    respawn: true,
    loadingScreenId: null
};

/** Header, Dimension ID, Position, Respawn, and absent Loading Screen Id. */
const withoutScreenBytes = [
    0x3d, // Header: id 61, no subclient ids.
    0x02, // Dimension ID: the Nether (1) as a ZigZag varint.
    0x00,
    0x00,
    0x00,
    0x00, // Position X: 0
    0x00,
    0x00,
    0x80,
    0x42, // Position Y: 64
    0x00,
    0x00,
    0x00,
    0x00, // Position Z: 0
    0x01, // Respawn
    0x00 // Loading Screen Id absent
];

describe('ChangeDimensionPacket', () => {
    it('encodes a presence byte without an id when no loading screen is expected', () => {
        const packet = new ChangeDimensionPacket(withoutScreen);
        packet.encode();

        expect([...packet.getBuffer()]).toEqual(withoutScreenBytes);
    });

    it('encodes a loading screen id as a little-endian uint32 after its presence byte', () => {
        const packet = new ChangeDimensionPacket({ ...withoutScreen, loadingScreenId: 0x01020304 });
        packet.encode();

        expect([...packet.getBuffer()]).toEqual([
            ...withoutScreenBytes.slice(0, -1),
            0x01, // Loading Screen Id present
            0x04,
            0x03,
            0x02,
            0x01
        ]);
    });

    it('decodes a packet buffer', () => {
        const packet = new ChangeDimensionPacket(Buffer.from(withoutScreenBytes));
        packet.decode();

        expect(packet.getPacketData()).toEqual(withoutScreen);
    });

    it('uses the expected network identifier', () => {
        expect(new ChangeDimensionPacket(withoutScreen).getId()).toBe(PacketIdentifier.CHANGE_DIMENSION);
    });
});
