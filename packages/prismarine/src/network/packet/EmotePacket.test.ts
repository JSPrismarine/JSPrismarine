import { describe, expect, it } from 'vitest';
import EmotePacket, { EmoteFlags } from './EmotePacket';

describe('EmotePacket', () => {
    // Header: id 138 as LEB128 is 0x8a 0x01.
    it('decodes the six fields and consumes the whole buffer', () => {
        const packet = new EmotePacket(
            Buffer.from([
                0x8a,
                0x01,
                0x80,
                0x01, // runtime id 128 as varuint64
                0x02,
                0x69,
                0x64, // "id"
                0x28, // 40 ticks
                0x03,
                0x31,
                0x32,
                0x33, // "123"
                0x01,
                0x70, // "p"
                0x02 // MuteChat
            ])
        );
        packet.decode();

        expect(packet.actorRuntimeId).toBe(128n);
        expect(packet.emoteId).toBe('id');
        expect(packet.emoteLengthTicks).toBe(40);
        expect(packet.xuid).toBe('123');
        expect(packet.platformId).toBe('p');
        expect(packet.flags).toBe(EmoteFlags.MuteChat);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new EmotePacket();
        packet.actorRuntimeId = 128n;
        packet.emoteId = 'id';
        packet.emoteLengthTicks = 40;
        packet.xuid = '123';
        packet.platformId = 'p';
        packet.flags = EmoteFlags.MuteChat;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([0x8a, 0x01, 0x80, 0x01, 0x02, 0x69, 0x64, 0x28, 0x03, 0x31, 0x32, 0x33, 0x01, 0x70, 0x02])
        );
    });
});
