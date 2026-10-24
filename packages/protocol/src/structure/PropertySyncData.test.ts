import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PropertySyncData from './PropertySyncData';

// One group per docs field, in wire order.
const wire = Buffer.from([
    0x01, // Int Entries List: varuint32 count 1
    0x00, // Property Index 0
    0x01, // Data: varint32 ZigZag -1
    0x01, // Float Entries List: varuint32 count 1
    0x01, // Property Index 1
    0x00,
    0x00,
    0xc0,
    0x3f // Data: float LE 1.5
]);

describe('PropertySyncData', () => {
    it('serializes both lists in docs order', () => {
        const stream = new NetworkBinaryStream();
        new PropertySyncData([[0, -1]], [[1, 1.5]]).serialize(stream);

        expect(stream.getBuffer()).toEqual(wire);
    });

    it('serializes two empty lists as two zero counts', () => {
        const stream = new NetworkBinaryStream();
        new PropertySyncData([], []).serialize(stream);

        expect(stream.getBuffer()).toEqual(Buffer.from([0x00, 0x00]));
    });

    it('deserializes a hand-built buffer and consumes it all', () => {
        const stream = new NetworkBinaryStream(wire);
        const data = PropertySyncData.deserialize(stream);

        expect(data.intEntriesList).toEqual([[0, -1]]);
        expect(data.floatEntriesList).toEqual([[1, 1.5]]);
        expect(stream.feof()).toBe(true);
    });
});
