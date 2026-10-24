import { describe, expect, it } from 'vitest';
import DebugInfoPacket from './DebugInfoPacket';

describe('DebugInfoPacket', () => {
    // Header: id 155 is 0x9b 0x01. Actor id 1 zigzags to 0x02, then "hi" as a varuint length
    // of 2 and two ASCII letters.
    const encoded = Buffer.from([0x9b, 0x01, 0x02, 0x02, 0x68, 0x69]);

    it('decodes the actor id and the data, consuming the whole buffer', () => {
        const packet = new DebugInfoPacket(encoded);
        packet.decode();

        expect(packet.actorId).toBe(1n);
        expect(packet.data).toBe('hi');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new DebugInfoPacket();
        packet.actorId = 1n;
        packet.data = 'hi';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('zigzags a negative actor id into one byte', () => {
        const packet = new DebugInfoPacket();
        packet.actorId = -1n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x9b, 0x01, 0x01, 0x00]));
    });
});
