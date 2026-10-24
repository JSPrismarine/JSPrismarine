import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DataStoreUpdate, { DataStoreValueType } from '../structure/DataStoreUpdate';
import ServerboundDataStorePacket from './ServerboundDataStorePacket';

import type { DataStoreValue } from '../structure/DataStoreUpdate';
import type { ServerboundDataStore } from './ServerboundDataStorePacket';

/** The packet id 332 as a varuint32 header, no subclient ids. */
const HEADER = [0xcc, 0x02];

/** The strings every vector opens with: "hud", "score", "a.b", each a varuint32 length then UTF-8. */
const STRINGS = [...[0x03, 0x68, 0x75, 0x64], ...[0x05, 0x73, 0x63, 0x6f, 0x72, 0x65], ...[0x03, 0x61, 0x2e, 0x62]];

/** `Property Update Count` 7 and `Path Update Count` 300 as little-endian uint32. */
const COUNTS = [...[0x07, 0x00, 0x00, 0x00], ...[0x2c, 0x01, 0x00, 0x00]];

/**
 * One vector per `Data` alternative, written by hand in the docs' order: the header, the
 * three strings, the one-of selector as a varuint32, the value, then the two counts.
 */
const vectors: Array<{ name: string; data: DataStoreValue; bytes: number[] }> = [
    {
        name: 'a double',
        data: { type: DataStoreValueType.DOUBLE, value: 1.5 },
        bytes: [
            ...HEADER, // packet id header
            ...STRINGS, // Data Store Name, Property, Path
            0x00, // Data one-of selector: double
            ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f], // Data: 1.5 as a little-endian double
            ...COUNTS // Property Update Count, Path Update Count
        ]
    },
    {
        name: 'a boolean',
        data: { type: DataStoreValueType.BOOLEAN, value: true },
        bytes: [
            ...HEADER, // packet id header
            ...STRINGS, // Data Store Name, Property, Path
            0x01, // Data one-of selector: boolean
            0x01, // Data: true
            ...COUNTS // Property Update Count, Path Update Count
        ]
    },
    {
        name: 'a string',
        data: { type: DataStoreValueType.STRING, value: 'ok' },
        bytes: [
            ...HEADER, // packet id header
            ...STRINGS, // Data Store Name, Property, Path
            0x02, // Data one-of selector: string
            ...[0x02, 0x6f, 0x6b], // Data: "ok"
            ...COUNTS // Property Update Count, Path Update Count
        ]
    }
];

const encode = (data: ServerboundDataStore): Buffer =>
    new ServerboundDataStorePacket(data).serialize(new NetworkBinaryStream());

const decode = (bytes: Buffer): ServerboundDataStore => {
    const stream = new NetworkBinaryStream(bytes);
    const data = new ServerboundDataStorePacket().deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

describe('ServerboundDataStorePacket', () => {
    for (const { name, data, bytes } of vectors) {
        const packet: ServerboundDataStore = { update: new DataStoreUpdate('hud', 'score', 'a.b', data, 7, 300) };

        it(`writes an update carrying ${name} in the order protocol 2193 defines`, () => {
            expect([...encode(packet)]).toEqual(bytes);
        });

        it(`reads an update carrying ${name} to the end of the buffer`, () => {
            expect(decode(Buffer.from(bytes))).toEqual(packet);
        });
    }

    it('rejects a header with another packet id', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0xca, 0x02, ...STRINGS, 0x01, 0x01, ...COUNTS]));

        expect(() => new ServerboundDataStorePacket().deserialize(stream)).toThrow(/expected 332, got 330/);
    });
});
