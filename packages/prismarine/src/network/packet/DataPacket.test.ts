import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { readPacketId } from './DataPacket';

/**
 * The header written the way a packet writes it: the id, plus the two subclient ids above it.
 * @see DataPacket.encodeHeader
 */
const header = (id: number, senderSubId = 0, receiverSubId = 0): Uint8Array => {
    const stream = new BinaryStream();
    stream.writeUnsignedVarInt(id | (senderSubId << 10) | (receiverSubId << 12));
    stream.writeVarInt(1234); // Whatever payload follows; it must not be read.

    return new Uint8Array(stream.getBuffer());
};

describe('readPacketId', () => {
    it('reads an id that fits in one byte', () => {
        expect(readPacketId(header(0x0b))).toBe(0x0b);
    });

    it('reads an id whose header spans two bytes', () => {
        // 128 to 255 is where the old byte read happened to be right: the varint's first byte
        // equals the id there, which is why this went unnoticed for so long.
        expect(readPacketId(header(0x93))).toBe(0x93);
    });

    it('reads an id above 255, which reading one byte could not', () => {
        // `SetPlayerInventoryOptions`. Its header is `b3 02`, and taking the first byte gave
        // 179 - `TickingAreasLoadStatus` - which then failed to decode as itself. Switching an
        // inventory tab raised an error about ticking areas.
        expect(header(0x133)[0]).toBe(0xb3);
        expect(readPacketId(header(0x133))).toBe(0x133);
    });

    it('ignores the subclient ids sharing the header', () => {
        expect(readPacketId(header(0x133, 1, 2))).toBe(0x133);
        expect(readPacketId(header(0x0b, 3, 3))).toBe(0x0b);
    });

    it('gives back what the packet itself will read', () => {
        // The two must agree or dispatch picks one class and decoding asserts another.
        for (const id of [0x01, 0x7f, 0x80, 0xb3, 0xff, 0x100, 0x133, 0x3ff]) {
            const stream = new BinaryStream(Buffer.from(header(id)));

            expect(readPacketId(header(id))).toBe(stream.readUnsignedVarInt() & 0x3ff);
        }
    });

    it('does not run off the end of a truncated buffer', () => {
        expect(() => readPacketId(new Uint8Array([0xb3]))).not.toThrow();
        expect(() => readPacketId(new Uint8Array([]))).not.toThrow();
    });
});
