import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DataStoreUpdate, { DataStoreValueType } from '../structure/DataStoreUpdate';
import ClientboundDataStorePacket, { DataStoreEntryType, DataStorePropertyType } from './ClientboundDataStorePacket';

import type { ClientboundDataStore, DataStorePropertyValue } from './ClientboundDataStorePacket';

/** The packet id 330 as a varuint32 header, no subclient ids. */
const HEADER = [0xca, 0x02];

/** "hud" as a string: varuint32 length then UTF-8. */
const HUD = [0x03, 0x68, 0x75, 0x64];

/** One entry of each alternative, in the order the schema lists them. */
const DATA: ClientboundDataStore = {
    updates: [
        {
            type: DataStoreEntryType.UPDATE,
            update: new DataStoreUpdate('hud', 'score', 'a', { type: DataStoreValueType.BOOLEAN, value: true }, 2, 3)
        },
        {
            type: DataStoreEntryType.CHANGE,
            change: {
                dataStoreName: 'hud',
                property: 'score',
                updateCount: 4,
                value: { type: DataStorePropertyType.DOUBLE, value: 1.5 }
            }
        },
        { type: DataStoreEntryType.REMOVAL, removal: { dataStoreName: 'hud' } }
    ]
};

/** `DATA` on the wire, header bytes included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...HEADER, // packet id header
    0x03, // Updates count, a varuint32
    0x00, // one-of selector: Data Store Update
    ...HUD, // Data Store Name "hud"
    ...[0x05, 0x73, 0x63, 0x6f, 0x72, 0x65], // Property "score"
    ...[0x01, 0x61], // Path "a"
    0x01, // Data one-of selector: boolean
    0x01, // Data: true
    ...[0x02, 0x00, 0x00, 0x00], // Property Update Count 2, little-endian uint32
    ...[0x03, 0x00, 0x00, 0x00], // Path Update Count 3, little-endian uint32
    0x01, // one-of selector: Data Store Change
    ...HUD, // Data Store Name "hud"
    ...[0x05, 0x73, 0x63, 0x6f, 0x72, 0x65], // Property "score"
    ...[0x04, 0x00, 0x00, 0x00], // Update Count 4, little-endian uint32
    ...[0x03, 0x00, 0x00, 0x00], // The New Property Value type: Double (3), little-endian int32
    ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f], // The New Property Value: 1.5 as a little-endian double
    0x02, // one-of selector: Data Store Removal
    ...HUD // Data Store Name "hud"
]);

/** An empty batch: the header and a zero count. */
const EMPTY_BYTES = Buffer.from([...HEADER, 0x00]);

/**
 * A `Data Store Change` whose value nests every property value type: a map with a list of a
 * bool, an int64 and a none, plus a string entry.
 */
const NESTED_VALUE: DataStorePropertyValue = {
    type: DataStorePropertyType.MAP,
    value: [
        {
            key: 'l',
            value: {
                type: DataStorePropertyType.LIST,
                value: [
                    { type: DataStorePropertyType.BOOL, value: false },
                    { type: DataStorePropertyType.INT64, value: -2n },
                    { type: DataStorePropertyType.NONE }
                ]
            }
        },
        { key: 's', value: { type: DataStorePropertyType.STRING, value: 'x' } }
    ]
};

const NESTED: ClientboundDataStore = {
    updates: [
        {
            type: DataStoreEntryType.CHANGE,
            change: { dataStoreName: 'hud', property: 'p', updateCount: 1, value: NESTED_VALUE }
        }
    ]
};

const NESTED_BYTES = Buffer.from([
    ...HEADER, // packet id header
    0x01, // Updates count
    0x01, // one-of selector: Data Store Change
    ...HUD, // Data Store Name "hud"
    ...[0x01, 0x70], // Property "p"
    ...[0x01, 0x00, 0x00, 0x00], // Update Count 1
    ...[0x06, 0x00, 0x00, 0x00], // value type: Map (6)
    0x02, // map entry count, a varuint32
    ...[0x01, 0x6c], // key "l"
    ...[0x05, 0x00, 0x00, 0x00], // value type: List (5)
    0x03, // list item count, a varuint32
    ...[0x01, 0x00, 0x00, 0x00], // item type: Bool (1)
    0x00, // item: false
    ...[0x02, 0x00, 0x00, 0x00], // item type: Int64 (2)
    ...[0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], // item: -2 as a little-endian int64
    ...[0x00, 0x00, 0x00, 0x00], // item type: None (0), no value follows
    ...[0x01, 0x73], // key "s"
    ...[0x04, 0x00, 0x00, 0x00], // value type: String (4)
    ...[0x01, 0x78] // value "x"
]);

const encode = (data: ClientboundDataStore): Buffer =>
    new ClientboundDataStorePacket(data).serialize(new NetworkBinaryStream());

const decode = (bytes: Buffer): ClientboundDataStore => {
    const stream = new NetworkBinaryStream(bytes);
    const data = new ClientboundDataStorePacket().deserialize(stream);
    expect(stream.feof()).toBe(true);
    return data;
};

describe('ClientboundDataStorePacket', () => {
    it('writes an empty batch as the header and a zero count', () => {
        expect([...encode({ updates: [] })]).toEqual([...EMPTY_BYTES]);
    });

    it('reads an empty batch to the end of the buffer', () => {
        expect(decode(EMPTY_BYTES)).toEqual({ updates: [] });
    });

    it('writes every alternative in the order protocol 2193 defines', () => {
        expect([...encode(DATA)]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer with every alternative to its end', () => {
        expect(decode(BYTES)).toEqual(DATA);
    });

    it('writes a nested property value with an int32 type tag before each value', () => {
        expect([...encode(NESTED)]).toEqual([...NESTED_BYTES]);
    });

    it('reads a nested property value to the end of the buffer', () => {
        expect(decode(NESTED_BYTES)).toEqual(NESTED);
    });

    it('rejects an entry selector outside the three alternatives', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...HEADER, 0x01, 0x03, ...HUD]));

        expect(() => new ClientboundDataStorePacket().deserialize(stream)).toThrow(/unknown type 3/);
    });

    it('rejects a property value type outside the seven known ones', () => {
        const bytes = Buffer.from([
            ...HEADER,
            0x01,
            0x01,
            ...HUD,
            ...[0x01, 0x70],
            0x01,
            0x00,
            0x00,
            0x00,
            0x07,
            0x00,
            0x00,
            0x00
        ]);
        const stream = new NetworkBinaryStream(bytes);

        expect(() => new ClientboundDataStorePacket().deserialize(stream)).toThrow(/unknown type 7/);
    });
});
