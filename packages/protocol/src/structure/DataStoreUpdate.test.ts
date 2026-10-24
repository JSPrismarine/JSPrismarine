import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import DataStoreUpdate, { DataStoreValueType } from './DataStoreUpdate';

import type { DataStoreValue } from './DataStoreUpdate';

const encode = (update: DataStoreUpdate): Buffer => {
    const stream = new NetworkBinaryStream();
    update.serialize(stream);
    return stream.getBuffer();
};

const decode = (bytes: Buffer): DataStoreUpdate => {
    const stream = new NetworkBinaryStream(bytes);
    const update = DataStoreUpdate.deserialize(stream);
    expect(stream.feof()).toBe(true);
    return update;
};

/** The three strings every vector opens with: "hud", "score", "a.b", each as a varuint32 length then UTF-8. */
const HEAD = [...[0x03, 0x68, 0x75, 0x64], ...[0x05, 0x73, 0x63, 0x6f, 0x72, 0x65], ...[0x03, 0x61, 0x2e, 0x62]];

/** `Property Update Count` 7 and `Path Update Count` 300 as little-endian uint32. */
const TAIL = [...[0x07, 0x00, 0x00, 0x00], ...[0x2c, 0x01, 0x00, 0x00]];

/**
 * One vector per `Data` alternative, written by hand in the docs' order: the three strings,
 * the one-of selector as a varuint32, the alternative's value, then the two counts.
 */
const vectors: Array<{ name: string; data: DataStoreValue; bytes: number[] }> = [
    {
        name: 'DOUBLE as a little-endian double',
        data: { type: DataStoreValueType.DOUBLE, value: 1.5 },
        bytes: [...HEAD, 0x00, ...[0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f], ...TAIL]
    },
    {
        name: 'BOOLEAN as one byte',
        data: { type: DataStoreValueType.BOOLEAN, value: true },
        bytes: [...HEAD, 0x01, 0x01, ...TAIL]
    },
    {
        name: 'STRING as a length-prefixed string',
        data: { type: DataStoreValueType.STRING, value: 'ok' },
        bytes: [...HEAD, 0x02, ...[0x02, 0x6f, 0x6b], ...TAIL]
    }
];

describe('DataStoreUpdate', () => {
    for (const { name, data, bytes } of vectors) {
        const update = new DataStoreUpdate('hud', 'score', 'a.b', data, 7, 300);

        it(`writes ${name} in the order protocol 2193 defines`, () => {
            expect([...encode(update)]).toEqual(bytes);
        });

        it(`reads ${name} to the end of the buffer`, () => {
            expect(decode(Buffer.from(bytes))).toEqual(update);
        });
    }

    it('rejects a Data selector outside the three alternatives', () => {
        const stream = new NetworkBinaryStream(Buffer.from([...HEAD, 0x03, ...TAIL]));

        expect(() => DataStoreUpdate.deserialize(stream)).toThrow(/unknown data type 3/);
    });

    it('constructs an empty update without arguments', () => {
        const update = new DataStoreUpdate();

        expect(update.dataStoreName).toBe('');
        expect(update.data).toEqual({ type: DataStoreValueType.DOUBLE, value: 0 });
        expect(update.pathUpdateCount).toBe(0);
    });
});
