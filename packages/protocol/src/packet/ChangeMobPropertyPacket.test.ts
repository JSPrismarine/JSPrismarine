import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ChangeMobPropertyPacket from './ChangeMobPropertyPacket';

import type { ChangeMobProperty } from './ChangeMobPropertyPacket';

const DATA: ChangeMobProperty = {
    actorUniqueId: 5n,
    propertyName: 'jsp:size',
    boolValue: true,
    stringValue: 'tall',
    intValue: -3,
    floatValue: 1.5
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xb6, 0x01], // packet id 182 as a varuint32 header
    0x0a, // Actor Id 5, ZigZag varint64
    ...[0x08, ...Buffer.from('jsp:size', 'utf8')], // Property Name
    0x01, // BoolComponent Value
    ...[0x04, ...Buffer.from('tall', 'utf8')], // StringComponent Value
    0x05, // IntComponent Value -3, ZigZag varint32
    ...[0x00, 0x00, 0xc0, 0x3f] // FloatComponent Value 1.5, little-endian float
]);

describe('ChangeMobPropertyPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ChangeMobPropertyPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ChangeMobPropertyPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a negative actor id and a float that needs all 32 bits', () => {
        const input: ChangeMobProperty = {
            actorUniqueId: -1n,
            propertyName: '',
            boolValue: false,
            stringValue: '',
            intValue: 2147483647,
            floatValue: 0.1
        };
        const buffer = new ChangeMobPropertyPacket(input).serialize(new NetworkBinaryStream());
        const data = new ChangeMobPropertyPacket().deserialize(new NetworkBinaryStream(buffer));

        expect(data).toEqual({ ...input, floatValue: Math.fround(0.1) });
    });
});
