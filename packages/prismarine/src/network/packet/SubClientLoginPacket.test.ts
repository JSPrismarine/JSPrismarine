import { describe, expect, it } from 'vitest';
import SubClientLoginPacket from './SubClientLoginPacket';

describe('SubClientLoginPacket', () => {
    // One Buffer per docs field, in wire order. The request holds two strings, each a uint32
    // LE byte length followed by ASCII.
    const encoded = Buffer.concat([
        Buffer.from([0x5e]), // Header, packet 94
        Buffer.from([0x0b]), // Sub Client Connection Request: varuint32 length 11
        Buffer.from([0x02, 0x00, 0x00, 0x00]),
        Buffer.from('{}'), // The chain JSON
        Buffer.from([0x01, 0x00, 0x00, 0x00]),
        Buffer.from('x') // The client data JWT
    ]);

    it('decodes both strings and consumes the whole buffer', () => {
        const packet = new SubClientLoginPacket(encoded);
        packet.decode();

        expect(packet.chainData).toBe('{}');
        expect(packet.clientData).toBe('x');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes back', () => {
        const packet = new SubClientLoginPacket();
        packet.chainData = '{}';
        packet.clientData = 'x';
        packet.encode();

        expect(packet.getBuffer()).toEqual(encoded);
    });

    it('refuses a request with bytes after the client data', () => {
        const padded = Buffer.concat([
            Buffer.from([0x5e]),
            Buffer.from([0x0c]), // One byte more than the two strings need.
            Buffer.from([0x02, 0x00, 0x00, 0x00]),
            Buffer.from('{}'),
            Buffer.from([0x01, 0x00, 0x00, 0x00]),
            Buffer.from('x'),
            Buffer.from([0x00])
        ]);

        expect(() => new SubClientLoginPacket(padded).decode()).toThrow(/1 unread bytes/);
    });
});
