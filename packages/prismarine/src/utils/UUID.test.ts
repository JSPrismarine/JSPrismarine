import { describe, expect, it } from 'vitest';

import BinaryStream from '@jsprismarine/binaryutils';
import { NetworkBinaryStream, UUID as NetworkUUID } from '@jsprismarine/protocol';
import UUID from './UUID';

/**
 * An `mce::UUID` is the two 64 bit halves of the uuid, most significant first, each written
 * little endian and both unsigned.
 *
 * That is `Writer.UUID` in gophertunnel: it moves the low half in front of the high one and
 * then reverses all sixteen bytes, which leaves `reverse(most)` followed by `reverse(least)`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/mce-uuid/}
 * {@link https://raw.githubusercontent.com/Sandertv/gophertunnel/master/minecraft/protocol/writer.go}
 */

/** A uuid whose every byte is distinct, so a transposed half cannot pass unnoticed. */
const PLAYER_UUID = '00112233-4455-6677-8899-aabbccddeeff';

// Most Significant Bits 0x0011223344556677 little endian, then Least Significant Bits
// 0x8899aabbccddeeff little endian.
const PLAYER_UUID_WIRE = Buffer.from([
    0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11, 0x00, 0xff, 0xee, 0xdd, 0xcc, 0xbb, 0xaa, 0x99, 0x88
]);

/** Both halves have their top bit set, which is where a signed writer gives up. */
const HIGH_UUID = 'ffeeddcc-bbaa-9988-ffff-ffffffffffff';

const HIGH_UUID_WIRE = Buffer.from([
    0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff
]);

const serialized = (uuid: UUID): Buffer => {
    const stream = new BinaryStream();
    uuid.networkSerialize(stream);
    return stream.getWriteBuffer();
};

describe('utils', () => {
    describe('UUID', () => {
        it('should create a proper UUID from parts', () => {
            let uuid = new UUID(1, 1, 1, 1);
            expect(uuid.toString()).toBe('00000001-0000-0001-0000-000100000001');
            expect(uuid.getParts()).toStrictEqual([1, 1, 1, 1]);

            uuid = new UUID(75, 8000, 10095, 1337);
            expect(uuid.toString()).toBe('0000004b-0000-1f40-0000-276f00000539');
            expect(uuid.getParts()).toStrictEqual([75, 8000, 10095, 1337]);
        });

        it('toBinary() should return proper parts', () => {
            const uuid = UUID.fromRandom();
            const binary = new BinaryStream(uuid.toBinary());
            const parts = uuid.getParts();

            expect(binary.readInt()).toBe(parts[0]);
            expect(binary.readInt()).toBe(parts[1]);
            expect(binary.readInt()).toBe(parts[2]);
            expect(binary.readInt()).toBe(parts[3]);
        });

        it('accepts the hyphenated form a client sends', () => {
            expect(UUID.fromString(PLAYER_UUID).toString()).toBe(PLAYER_UUID);
            expect(UUID.fromString(PLAYER_UUID.replaceAll('-', '')).toString()).toBe(PLAYER_UUID);
            expect(UUID.fromString(`  ${PLAYER_UUID.toUpperCase()}  `).toString()).toBe(PLAYER_UUID);
        });

        it('serializes a known uuid to the sixteen bytes gophertunnel writes', () => {
            expect(serialized(UUID.fromString(PLAYER_UUID))).toEqual(PLAYER_UUID_WIRE);
        });

        it('serializes halves at or above 2^63 without throwing', () => {
            expect(serialized(UUID.fromString(HIGH_UUID))).toEqual(HIGH_UUID_WIRE);
        });

        it('accepts unsigned words above 2^31 in the constructor', () => {
            const fromUnsigned = new UUID(0xffeeddcc, 0xbbaa9988, 0xffffffff, 0xffffffff);

            expect(fromUnsigned.equals(UUID.fromString(HIGH_UUID))).toBe(true);
            expect(fromUnsigned.toString()).toBe(HIGH_UUID);
            expect(serialized(fromUnsigned)).toEqual(HIGH_UUID_WIRE);
        });

        it('reads back what it wrote, consuming the whole uuid', () => {
            for (const value of [PLAYER_UUID, HIGH_UUID]) {
                const stream = new BinaryStream(serialized(UUID.fromString(value)));

                expect(UUID.networkDeserialize(stream).toString()).toBe(value);
                expect(stream.feof()).toBe(true);
            }
        });

        it('agrees byte for byte with the codec in @jsprismarine/protocol', () => {
            for (const [value, wire] of [
                [PLAYER_UUID, PLAYER_UUID_WIRE],
                [HIGH_UUID, HIGH_UUID_WIRE]
            ] as const) {
                const stream = new NetworkBinaryStream();
                const bytes = Buffer.from(value.replaceAll('-', ''), 'hex');

                new NetworkUUID(bytes.readBigUInt64BE(0), bytes.readBigUInt64BE(8)).serialize(stream);

                expect(stream.getWriteBuffer()).toEqual(wire);
                expect(stream.getWriteBuffer()).toEqual(serialized(UUID.fromString(value)));
            }
        });
    });
});
