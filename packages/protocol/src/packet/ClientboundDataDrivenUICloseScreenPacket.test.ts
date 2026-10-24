import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ClientboundDataDrivenUICloseScreenPacket from './ClientboundDataDrivenUICloseScreenPacket';

import type { ClientboundDataDrivenUICloseScreen } from './ClientboundDataDrivenUICloseScreenPacket';

/** Header bytes: 334 as a varuint32. */
const HEADER = [0xce, 0x02];

const ONE_SCREEN: ClientboundDataDrivenUICloseScreen = { formId: 0x01020304 };

/** `ONE_SCREEN` on the wire, header included, written by hand in the order the docs list the fields. */
const ONE_SCREEN_BYTES = Buffer.from([
    ...HEADER,
    0x01, // FormId present
    ...[0x04, 0x03, 0x02, 0x01] // FormId 0x01020304, little-endian uint32
]);

const ALL_SCREENS: ClientboundDataDrivenUICloseScreen = {};

/** `ALL_SCREENS` on the wire: the header and an absent optional. */
const ALL_SCREENS_BYTES = Buffer.from([
    ...HEADER,
    0x00 // FormId absent: close every screen
]);

describe('ClientboundDataDrivenUICloseScreenPacket', () => {
    it.each([
        ['one screen', ONE_SCREEN, ONE_SCREEN_BYTES],
        ['every screen', ALL_SCREENS, ALL_SCREENS_BYTES]
    ])('writes a close of %s in the order protocol 2193 defines', (_, data, bytes) => {
        const buffer = new ClientboundDataDrivenUICloseScreenPacket(data).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...bytes]);
    });

    it.each([
        ['one screen', ONE_SCREEN, ONE_SCREEN_BYTES],
        ['every screen', ALL_SCREENS, ALL_SCREENS_BYTES]
    ])('reads a hand-built close of %s to its end', (_, data, bytes) => {
        const stream = new NetworkBinaryStream(bytes);
        const read = new ClientboundDataDrivenUICloseScreenPacket().deserialize(stream);

        expect(read).toStrictEqual(data);
        expect(stream.feof()).toBe(true);
    });

    it('round-trips a populated packet', () => {
        const buffer = new ClientboundDataDrivenUICloseScreenPacket(ONE_SCREEN).serialize(new NetworkBinaryStream());
        const stream = new NetworkBinaryStream(buffer);

        expect(new ClientboundDataDrivenUICloseScreenPacket().deserialize(stream)).toStrictEqual(ONE_SCREEN);
        expect(stream.feof()).toBe(true);
    });
});
