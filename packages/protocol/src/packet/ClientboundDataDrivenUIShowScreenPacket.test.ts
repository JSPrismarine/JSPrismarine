import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientboundDataDrivenUIShowScreenPacket from './ClientboundDataDrivenUIShowScreenPacket';

import type { ClientboundDataDrivenUIShowScreen } from './ClientboundDataDrivenUIShowScreenPacket';

/** Header bytes: 333 as a varuint32. */
const HEADER = [0xcd, 0x02];

const WITH_DATA: ClientboundDataDrivenUIShowScreen = {
    screenId: 'my_pack:shop',
    formId: 0x01020304,
    dataInstanceId: 0xffffffff
};

/** `WITH_DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const WITH_DATA_BYTES = Buffer.from([
    ...HEADER,
    ...[0x0c, ...Buffer.from('my_pack:shop', 'utf8')], // ScreenId, 12 bytes
    ...[0x04, 0x03, 0x02, 0x01], // FormId 0x01020304, little-endian uint32
    0x01, // DataInstanceId present
    ...[0xff, 0xff, 0xff, 0xff] // DataInstanceId 0xffffffff, little-endian uint32
]);

const WITHOUT_DATA: ClientboundDataDrivenUIShowScreen = {
    screenId: 'a',
    formId: 7
};

/** `WITHOUT_DATA` on the wire: the header, a one-byte screen id, the form id, an absent optional. */
const WITHOUT_DATA_BYTES = Buffer.from([
    ...HEADER,
    ...[0x01, 0x61], // ScreenId "a"
    ...[0x07, 0x00, 0x00, 0x00], // FormId 7, little-endian uint32
    0x00 // DataInstanceId absent
]);

describe('ClientboundDataDrivenUIShowScreenPacket', () => {
    it.each([
        ['a data instance', WITH_DATA, WITH_DATA_BYTES],
        ['no data instance', WITHOUT_DATA, WITHOUT_DATA_BYTES]
    ])('writes a screen with %s in the order protocol 2193 defines', (_, data, bytes) => {
        const buffer = new ClientboundDataDrivenUIShowScreenPacket(data).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...bytes]);
    });

    it.each([
        ['a data instance', WITH_DATA, WITH_DATA_BYTES],
        ['no data instance', WITHOUT_DATA, WITHOUT_DATA_BYTES]
    ])('reads a hand-built buffer with %s to its end', (_, data, bytes) => {
        const stream = new NetworkBinaryStream(bytes);
        const read = new ClientboundDataDrivenUIShowScreenPacket().deserialize(stream);

        expect(read).toStrictEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a populated packet', () => {
        const buffer = new ClientboundDataDrivenUIShowScreenPacket(WITH_DATA).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new ClientboundDataDrivenUIShowScreenPacket().deserialize(stream)).toStrictEqual(WITH_DATA);
        expect(stream.feof()).toBe(true);
    });
});
