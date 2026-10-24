import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SyncWorldClocksPacket, { SyncWorldClocksDataType } from './SyncWorldClocksPacket';

import type { SyncWorldClocks } from './SyncWorldClocksPacket';

/** Header bytes: 344 as a varuint32. */
const HEADER = [0xd8, 0x02];

const INITIALIZE: SyncWorldClocks = {
    data: {
        type: SyncWorldClocksDataType.InitializeRegistry,
        clocks: [
            {
                id: 7n,
                name: 'day',
                time: -1,
                isPaused: false,
                timeMarkers: [{ id: 300n, name: 'noon', time: 6000, period: 24000 }]
            }
        ]
    }
};

/** `INITIALIZE` on the wire, header included, written by hand in the order the docs list the fields. */
const INITIALIZE_BYTES = Buffer.from([
    ...HEADER,
    0x01, // Data selector: InitializeRegistryData is alternative 1
    0x01, // ClockData count, a varuint32
    0x07, // Id 7, varuint64
    ...[0x03, 0x64, 0x61, 0x79], // Name "day"
    0x01, // Time -1, ZigZag varint32
    0x00, // IsPaused
    0x01, // TimeMarkers count, a varuint32
    ...[0xac, 0x02], // marker Id 300, varuint64
    ...[0x04, 0x6e, 0x6f, 0x6f, 0x6e], // marker Name "noon"
    ...[0xe0, 0x5d], // marker Time 6000, ZigZag varint32 (12000)
    ...[0xc0, 0x5d, 0x00, 0x00] // marker Period 24000, little-endian int32
]);

const SYNC_STATE: SyncWorldClocks = {
    data: {
        type: SyncWorldClocksDataType.SyncState,
        clocks: [{ clockId: 7n, time: 6000, isPaused: true }]
    }
};

const SYNC_STATE_BYTES = Buffer.from([
    ...HEADER,
    0x00, // Data selector: SyncStateData is alternative 0
    0x01, // ClockData count
    0x07, // ClockId 7, varuint64
    ...[0xe0, 0x5d], // Time 6000, ZigZag varint32
    0x01 // IsPaused
]);

const REMOVE: SyncWorldClocks = {
    data: {
        type: SyncWorldClocksDataType.RemoveTimeMarker,
        clockId: 7n,
        timeMarkerIds: [1n, 300n]
    }
};

const REMOVE_BYTES = Buffer.from([
    ...HEADER,
    0x03, // Data selector: RemoveTimeMarkerData is alternative 3
    0x07, // ClockId 7, varuint64
    0x02, // TimeMarkerIds count
    0x01, // id 1, varuint64
    ...[0xac, 0x02] // id 300, varuint64
]);

const ADD: SyncWorldClocks = {
    data: {
        type: SyncWorldClocksDataType.AddTimeMarker,
        clockId: 0xffffffffffffffffn,
        timeMarkers: [
            { id: 1n, name: 'dawn', time: 0, period: 24000 },
            { id: 2n, name: 'dusk', time: 12000, period: -1 }
        ]
    }
};

const roundTrip = (data: SyncWorldClocks): SyncWorldClocks => {
    const buffer = new SyncWorldClocksPacket(data).serialize(new NetworkBinaryStream());
    const stream = new NetworkBinaryStream(buffer);
    const read = new SyncWorldClocksPacket().deserialize(stream);
    expect(stream.feof()).toBe(true);
    return read;
};

describe('SyncWorldClocksPacket', () => {
    it.each([
        ['InitializeRegistryData', INITIALIZE, INITIALIZE_BYTES],
        ['SyncStateData', SYNC_STATE, SYNC_STATE_BYTES],
        ['RemoveTimeMarkerData', REMOVE, REMOVE_BYTES]
    ])('writes %s with its selector first and every field in docs order', (_, data, bytes) => {
        const buffer = new SyncWorldClocksPacket(data).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...bytes]);
    });

    it.each([
        ['InitializeRegistryData', INITIALIZE, INITIALIZE_BYTES],
        ['SyncStateData', SYNC_STATE, SYNC_STATE_BYTES],
        ['RemoveTimeMarkerData', REMOVE, REMOVE_BYTES]
    ])('reads a hand-built %s buffer to its end', (_, data, bytes) => {
        const stream = new NetworkBinaryStream(bytes);

        expect(new SyncWorldClocksPacket().deserialize(stream)).toEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips AddTimeMarkerData with a full 64-bit clock id and a negative period', () => {
        expect(roundTrip(ADD)).toEqual(ADD);
    });

    it('round-trips an empty clock list', () => {
        const empty: SyncWorldClocks = { data: { type: SyncWorldClocksDataType.SyncState, clocks: [] } };

        expect(roundTrip(empty)).toEqual(empty);
    });

    it('rejects a selector the schema does not define', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...HEADER, 0x04]));

        expect(() => new SyncWorldClocksPacket().deserialize(stream)).toThrow(/data variant 4/);
    });
});
