import { describe, expect, it } from 'vitest';
import PacketViolationWarningPacket, {
    PacketViolationSeverity,
    PacketViolationType
} from './PacketViolationWarningPacket';

// Header: id 156 is 0x9c 0x01. Type 0 (PacketMalformed) zigzags to 0, severity 2
// (TerminatingConnection) to 4, and the offending id 156 to 312 (0xb8 0x02). The context
// "no" is a varuint length of 2 then the two ASCII letters.
const BYTES = Buffer.from([0x9c, 0x01, 0x00, 0x04, 0xb8, 0x02, 0x02, 0x6e, 0x6f]);

describe('PacketViolationWarningPacket', () => {
    it('decodes three signed varints and the context string, consuming the whole buffer', () => {
        const packet = new PacketViolationWarningPacket(BYTES);
        packet.decode();

        expect(packet.type).toBe(PacketViolationType.PacketMalformed);
        expect(packet.severity).toBe(PacketViolationSeverity.TerminatingConnection);
        expect(packet.packetId).toBe(156);
        expect(packet.message).toBe('no');
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new PacketViolationWarningPacket();
        packet.type = PacketViolationType.PacketMalformed;
        packet.severity = PacketViolationSeverity.TerminatingConnection;
        packet.packetId = 156;
        packet.message = 'no';
        packet.encode();

        expect(packet.getBuffer()).toEqual(BYTES);
    });

    it('reads the Unknown members, which are -1 and zigzag to 1', () => {
        // Packet id 11 (StartGame) zigzags to 22, then an empty context.
        const packet = new PacketViolationWarningPacket(Buffer.from([0x9c, 0x01, 0x01, 0x01, 0x16, 0x00]));
        packet.decode();

        expect(packet.type).toBe(PacketViolationType.Unknown);
        expect(packet.severity).toBe(PacketViolationSeverity.Unknown);
        expect(packet.packetId).toBe(11);
        expect(packet.message).toBe('');
        expect(packet.feof()).toBe(true);
    });
});
