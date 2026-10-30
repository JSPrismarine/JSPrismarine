import { describe, expect, it } from 'vitest';
import SetTimePacket from './SetTimePacket';

describe('SetTimePacket', () => {
    it('encodes the header and time as a ZigZag varint32', () => {
        const packet = new SetTimePacket({ time: 6000 });
        packet.encode();

        // Header: packet id 10. Time: 6000 zigzags to 12000, LEB128 0xe0 0x5d.
        expect(packet.getBuffer()).toEqual(Buffer.from([0x0a, 0xe0, 0x5d]));
    });

    it('encodes a negative time through ZigZag', () => {
        const packet = new SetTimePacket({ time: -6000 });
        packet.encode();

        // -6000 zigzags to 11999, LEB128 0xdf 0x5d.
        expect(packet.getBuffer()).toEqual(Buffer.from([0x0a, 0xdf, 0x5d]));
    });

    it('decodes the time from a packet buffer', () => {
        const packet = new SetTimePacket(Buffer.from([0x0a, 0xe0, 0x5d]));
        packet.decode();

        expect(packet.getPacketData()).toEqual({ time: 6000 });
    });
});
