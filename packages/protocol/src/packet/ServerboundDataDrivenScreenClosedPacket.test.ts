import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ServerboundDataDrivenScreenClosedPacket, {
    DataDrivenScreenClosedReason
} from './ServerboundDataDrivenScreenClosedPacket';

import type { ServerboundDataDrivenScreenClosed } from './ServerboundDataDrivenScreenClosedPacket';

/** Header bytes: 343 as a varuint32. */
const HEADER = [0xd7, 0x02];

const DATA: ServerboundDataDrivenScreenClosed = {
    formId: 0x01020304,
    closeReason: DataDrivenScreenClosedReason.ClientCanceled
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...HEADER,
    ...[0x04, 0x03, 0x02, 0x01], // FormId 0x01020304, little-endian uint32
    ...[0x0e, ...Buffer.from('clientcanceled', 'utf8')] // CloseReason as a lowercase member name, 14 bytes
]);

describe('ServerboundDataDrivenScreenClosedPacket', () => {
    it('spells the close reasons as the client sends them', () => {
        expect(Object.values(DataDrivenScreenClosedReason)).toEqual([
            'programmaticclose',
            'programmaticcloseall',
            'clientcanceled',
            'userbusy',
            'invalidform'
        ]);
    });

    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new ServerboundDataDrivenScreenClosedPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new ServerboundDataDrivenScreenClosedPacket().deserialize(stream);

        expect(data).toStrictEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it.each(Object.values(DataDrivenScreenClosedReason))('round-trips the %s reason', (closeReason) => {
        const data: ServerboundDataDrivenScreenClosed = { formId: 0xffffffff, closeReason };
        const buffer = new ServerboundDataDrivenScreenClosedPacket(data).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new ServerboundDataDrivenScreenClosedPacket().deserialize(stream)).toStrictEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('rejects a close reason the schema does not list', () => {
        const stream = new NetworkBinaryStream(
            Buffer.from([...HEADER, 0x00, 0x00, 0x00, 0x00, 0x05, ...Buffer.from('other', 'utf8')])
        );

        expect(() => new ServerboundDataDrivenScreenClosedPacket().deserialize(stream)).toThrow(
            /DataDrivenScreenClosedReason "other"/
        );
    });
});
