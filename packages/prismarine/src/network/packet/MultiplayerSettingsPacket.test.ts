import { describe, expect, it } from 'vitest';

import MultiplayerSettingsPacket, { MultiplayerSettingsPacketType } from './MultiplayerSettingsPacket';

// Packet id 139 as a varuint.
const HEADER = [0x8b, 0x01];

describe('MultiplayerSettingsPacket', () => {
    it('writes the packet type as a ZigZag varint32', () => {
        const packet = new MultiplayerSettingsPacket();
        packet.packetType = MultiplayerSettingsPacketType.RefreshJoincode;
        packet.encode();

        // 2 ZigZag encoded is 4.
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x04]));
    });

    it('defaults to enabling multiplayer', () => {
        const packet = new MultiplayerSettingsPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00]));
    });

    it('reads the packet type and consumes the whole buffer', () => {
        const packet = new MultiplayerSettingsPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, 0x02]));
        packet.decode();

        expect(packet.packetType).toBe(MultiplayerSettingsPacketType.DisableMultiplayer);
        expect(packet.feof()).toBe(true);
    });
});
