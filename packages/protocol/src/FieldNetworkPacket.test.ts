import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import FieldNetworkPacket from './FieldNetworkPacket';
import { readPacketId } from './NetworkPacket';

/**
 * The header written the way a packet writes it: the id, plus the two subclient ids above it.
 * @see FieldNetworkPacket.encodeHeader
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

/** `SetPlayerInventoryOptions`, the smallest id this protocol has that needs two bytes. */
class ThreeDigitPacket extends FieldNetworkPacket {
    public constructor(buffer?: Buffer) {
        super(buffer);
        this.setNetId(0x133);
    }
}

/** An id a single byte can hold, for the case the header is one byte long. */
class SingleBytePacket extends FieldNetworkPacket {
    public constructor(buffer?: Buffer) {
        super(buffer);
        this.setNetId(0x0b);
    }
}

describe('FieldNetworkPacket header', () => {
    it('encodes an id above 255 as a two byte varuint', () => {
        const packet = new ThreeDigitPacket();
        packet.encode();

        // 0x133 is 0b1_0011_0011: seven low bits with the continuation bit, then the rest.
        expect(packet.getBuffer()).toEqual(Buffer.from([0xb3, 0x02]));
    });

    it('encodes an id below 128 as one byte', () => {
        const packet = new SingleBytePacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([0x0b]));
    });

    it('decodes a three digit id, leaving the payload for the packet to read', () => {
        const packet = new ThreeDigitPacket(Buffer.from([0xb3, 0x02, 0x2a]));
        packet.decode();

        expect(packet.getId()).toBe(0x133);
        expect(packet.readByte()).toBe(0x2a);
        expect(packet.feof()).toBe(true);
    });

    it('refuses a buffer whose id is not its own', () => {
        // Dispatch picks the class from `readPacketId`; this is the check that the two agree.
        expect(() => new ThreeDigitPacket(Buffer.from([0x0b])).decode()).toThrow(
            /NetworkPacket ID mismatch: expected 307, got 11/
        );
    });

    it('carries the subclient ids in bits 10 to 13 of the same varuint', () => {
        // 0x133 | (1 << 10) | (2 << 12) is 0x2533, which is `b3 4a`. Decoding then encoding
        // has to give the bytes back: the two shifts are the only place split screen lives.
        const wire = Buffer.from([0xb3, 0x4a]);

        const packet = new ThreeDigitPacket(wire);
        packet.decode();
        expect(packet.getId()).toBe(0x133);

        packet.encode();
        expect(packet.getBuffer()).toEqual(wire);
    });
});
