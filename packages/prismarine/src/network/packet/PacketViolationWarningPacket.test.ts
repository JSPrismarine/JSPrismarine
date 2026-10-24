import { describe, expect, it } from 'vitest';
import PacketViolationWarningPacket from './PacketViolationWarningPacket';

// Header: id 156 is 0x9c 0x01. Type 1 (PacketMalformed) zigzags to 2, severity 3
// (TerminatingConnection) to 6, and the offending id 156 to 312 (0xb8 0x02). The context
// "no" is a varuint length of 2 then the two ASCII letters.
const BYTES = Buffer.from([0x9c, 0x01, 0x02, 0x06, 0xb8, 0x02, 0x02, 0x6e, 0x6f]);

describe('PacketViolationWarningPacket', () => {
    it('decodes three signed varints and the context string, consuming the whole buffer', () => {
        const packet = new PacketViolationWarningPacket(BYTES);
        packet.decode();

        expect(packet.type).toBe(1);
        expect(packet.severity).toBe(3);
        expect(packet.packetId).toBe(156);
        expect(packet.message).toBe('no');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new PacketViolationWarningPacket();
        packet.type = 1;
        packet.severity = 3;
        packet.packetId = 156;
        packet.message = 'no';
        packet.encode();

        expect(packet.getBuffer()).toEqual(BYTES);
    });
});
