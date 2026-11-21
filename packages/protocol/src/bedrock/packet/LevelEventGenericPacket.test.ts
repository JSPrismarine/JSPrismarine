import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';
import { layoutAt } from '../../wire/WireLayout';
import { levelEventGenericPacket } from '../wire/definitions/levelEventGeneric';
import LevelEventGenericPacket from './LevelEventGenericPacket';
import { capture } from '../../testing/evidence.test.helper';

// A headless compound: entries then TAG_End, with no type byte or root name in front. Here one
// TAG_Float (0x05) named `originX` (varuint length 7) holding 1.5, then TAG_End.
const EVENT_DATA = Buffer.from([0x05, 0x07, 0x6f, 0x72, 0x69, 0x67, 0x69, 0x6e, 0x58, 0x00, 0x00, 0xc0, 0x3f, 0x00]);

const ENCODED = Buffer.concat([
    Buffer.from([0x7c]), // Header: id 124 as LEB128.
    Buffer.from([0xd4, 0x1f]), // Event Id 2026 as a ZigZag varint32.
    EVENT_DATA // Event data to the end of the packet.
]);

describe('LevelEventGenericPacket', () => {
    it('encodes the event id as a ZigZag varint32 followed by the raw data', () => {
        const packet = Object.assign(new LevelEventGenericPacket(), {
            eventId: 2026,
            serializedEventData: EVENT_DATA
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes the event id and takes the rest of the buffer as the data', () => {
        const packet = new LevelEventGenericPacket(ENCODED);
        packet.decode();

        expect(packet.eventId).toBe(2026);
        expect(packet.serializedEventData).toEqual(EVENT_DATA);
        expect(packet.feof()).toBe(true);
    });

    for (const protocol of [2193, 2225]) {
        it(`re-encodes the real server capture to the same bytes at protocol ${protocol}`, () => {
            const captured = capture(protocol, 0x7c);
            const layout = layoutAt(levelEventGenericPacket, protocol);
            const read = new BinaryStream(captured);
            const decoded = layout.decode(read);
            const stream = new BinaryStream();
            layout.encode(stream, decoded);

            expect(read.feof()).toBe(true);
            expect(decoded.eventId).toBe(9801);
            expect(Buffer.from(stream.getBuffer())).toEqual(captured);
        });
    }
});
