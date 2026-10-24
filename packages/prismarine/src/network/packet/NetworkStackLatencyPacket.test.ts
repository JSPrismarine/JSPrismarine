import { describe, expect, it } from 'vitest';
import NetworkStackLatencyPacket from './NetworkStackLatencyPacket';

describe('NetworkStackLatencyPacket', () => {
    it('decodes the uint64 LE timestamp and the flag, consuming the whole buffer', () => {
        // Header 0x73. 0x0102030405060708 little endian, then true.
        const packet = new NetworkStackLatencyPacket(
            Buffer.from([0x73, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, 0x01])
        );
        packet.decode();

        expect(packet.creationTime).toBe(0x0102030405060708n);
        expect(packet.isFromServer).toBe(true);
        expect(packet.feof()).toBe(true);
    });

    it('encodes the same bytes', () => {
        const packet = new NetworkStackLatencyPacket();
        packet.creationTime = 2n;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x73, 0x02, 0, 0, 0, 0, 0, 0, 0, 0x00]));
    });
});
