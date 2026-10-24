import { describe, expect, it } from 'vitest';
import LevelEventGenericPacket from './LevelEventGenericPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x7c]), // Header: id 124 as LEB128.
    Buffer.from([0xd4, 0x1f]), // Event Id 2026 as a ZigZag varint32.
    Buffer.from([0x01, 0x02]) // Event data to the end of the packet.
]);

describe('LevelEventGenericPacket', () => {
    it('encodes the event id as a ZigZag varint32 followed by the raw data', () => {
        const packet = Object.assign(new LevelEventGenericPacket(), {
            eventId: 2026,
            serializedEventData: Buffer.from([0x01, 0x02])
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes the event id and takes the rest of the buffer as the data', () => {
        const packet = new LevelEventGenericPacket(ENCODED);
        packet.decode();

        expect(packet.eventId).toBe(2026);
        expect(packet.serializedEventData).toEqual(Buffer.from([0x01, 0x02]));
        expect(packet.feof()).toBe(true);
    });
});
