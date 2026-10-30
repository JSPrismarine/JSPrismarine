import { describe, expect, it } from 'vitest';

import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import EmoteListPacket from './EmoteListPacket';

// Packet id 152 as a varuint.
const HEADER = [0x98, 0x01];

// 0x1_0000_0001 as plain LEB128. It needs five bytes and does not fit in 32 bits, so a reader
// that stops at a varuint32 cannot produce it.
const RUNTIME_ID = 0x1_0000_0001n;
const RUNTIME_ID_BYTES = [0x81, 0x80, 0x80, 0x80, 0x10];

// 12345678-9abc-def0-1234-56789abcdef0 on the wire: the most significant uint64 half in little
// endian order, then the least significant half the same way.
const EMOTE_ID = '12345678-9abc-def0-1234-56789abcdef0';
const EMOTE_ID_BYTES = [0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0xf0, 0xde, 0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12];

const ONE_EMOTE = Buffer.from([...HEADER, ...RUNTIME_ID_BYTES, 0x01, ...EMOTE_ID_BYTES]);
const NO_EMOTES = Buffer.from([...HEADER, ...RUNTIME_ID_BYTES, 0x00]);

describe('EmoteListPacket', () => {
    it('writes the runtime id as a varuint64, then the count and each uuid', () => {
        const packet = new EmoteListPacket();
        packet.runtimeId = RUNTIME_ID;
        packet.emoteIds = [UUID.fromString(EMOTE_ID)];
        packet.encode();

        expect(packet.getBuffer()).toEqual(ONE_EMOTE);
    });

    it('writes an empty list as a zero count after the runtime id', () => {
        const packet = new EmoteListPacket();
        packet.runtimeId = RUNTIME_ID;
        packet.encode();

        expect(packet.getBuffer()).toEqual(NO_EMOTES);
    });

    it('reads a runtime id above 2^32 and the uuid, consuming the whole buffer', () => {
        const packet = new EmoteListPacket();
        packet.setReadBuffer(ONE_EMOTE);
        packet.decode();

        expect(packet.runtimeId).toBe(RUNTIME_ID);
        expect(packet.emoteIds.map((id) => id.toString())).toEqual([EMOTE_ID]);
        expect(packet.feof()).toBe(true);
    });

    it('reads an empty list and consumes the whole buffer', () => {
        const packet = new EmoteListPacket();
        packet.setReadBuffer(NO_EMOTES);
        packet.decode();

        expect(packet.runtimeId).toBe(RUNTIME_ID);
        expect(packet.emoteIds).toEqual([]);
        expect(packet.feof()).toBe(true);
    });
});
