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

    // A real emote piece id, a runtime id that needs five varuint bytes and does not fit in 32
    // bits, and both flag bits set, as the server's relayed copy of a muted emote carries.
    const RELAYED = Buffer.from([
        0x8a,
        0x01, // id 138
        0x81,
        0x80,
        0x80,
        0x80,
        0x10, // runtime id 0x1_0000_0001
        0x24, // 36 bytes of emote id
        ...Buffer.from('4c8ae710-df2e-47cd-814d-cc7bf21a3d67'),
        0xac,
        0x02, // 300 ticks
        0x10, // 16 bytes of xuid
        ...Buffer.from('2535428141485237'),
        0x00, // empty platform id
        0x03 // ServerSide | MuteChat
    ]);

    it('pins the layout for a uuid emote id and a runtime id above 2^32', () => {
        const packet = new EmotePacket(RELAYED);
        packet.decode();

        expect(packet.actorRuntimeId).toBe(0x1_0000_0001n);
        expect(packet.emoteId).toBe('4c8ae710-df2e-47cd-814d-cc7bf21a3d67');
        expect(packet.emoteLengthTicks).toBe(300);
        expect(packet.xuid).toBe('2535428141485237');
        expect(packet.platformId).toBe('');
        expect(packet.flags).toBe(EmoteFlags.ServerSide | EmoteFlags.MuteChat);
        expect(packet.feof()).toBe(true);

        const encoded = new EmotePacket();
        Object.assign(encoded, {
            actorRuntimeId: 0x1_0000_0001n,
            emoteId: '4c8ae710-df2e-47cd-814d-cc7bf21a3d67',
            emoteLengthTicks: 300,
            xuid: '2535428141485237',
            platformId: '',
            flags: EmoteFlags.ServerSide | EmoteFlags.MuteChat
        });
        encoded.encode();
        expect(encoded.getBuffer()).toEqual(RELAYED);
    });
});
