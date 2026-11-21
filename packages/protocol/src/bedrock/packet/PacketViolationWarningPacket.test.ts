import { describe, expect, it } from 'vitest';
import PacketViolationWarningPacket, {
    PacketViolationSeverity,
    PacketViolationType
} from './PacketViolationWarningPacket';
import { enumDumpMembers } from '../../testing/evidence.test.helper';

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

/**
 * Mojang's pinned enum dump from the 1.26.40 build lists both enums from -1, which is what the
 * 1.26.60 page prints and what the 1.26.50 page's dense 0.. numbering contradicts.
 */
describe("the violation enums against Mojang's pinned enum dump", () => {
    /** Reads one enum's member names and values from the dump's table. */
    const dumped = (name: string): Record<string, number> =>
        Object.fromEntries(enumDumpMembers(name).map((member) => [member.name, member.value]));

    it('numbers PacketViolationType as the dump does', () => {
        expect(dumped('PacketViolationType')).toEqual({ Unknown: -1, PacketMalformed: 0 });
        expect({ Unknown: PacketViolationType.Unknown, PacketMalformed: PacketViolationType.PacketMalformed }).toEqual(
            dumped('PacketViolationType')
        );
    });

    it('numbers PacketViolationSeverity as the dump does', () => {
        expect(dumped('PacketViolationSeverity')).toEqual({
            Unknown: -1,
            Warning: 0,
            FinalWarning: 1,
            TerminatingConnection: 2
        });
        expect({
            Unknown: PacketViolationSeverity.Unknown,
            Warning: PacketViolationSeverity.Warning,
            FinalWarning: PacketViolationSeverity.FinalWarning,
            TerminatingConnection: PacketViolationSeverity.TerminatingConnection
        }).toEqual(dumped('PacketViolationSeverity'));
    });
});
