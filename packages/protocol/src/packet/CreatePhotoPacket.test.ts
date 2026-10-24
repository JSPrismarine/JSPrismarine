import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import CreatePhotoPacket from './CreatePhotoPacket';

import type { CreatePhoto } from './CreatePhotoPacket';

const DATA: CreatePhoto = {
    rawId: 0x0102030405060708n,
    photoName: 'photo.jpeg',
    photoItemName: 'My photo'
};

/** `DATA` on the wire, header included, written by hand in the order the docs list the fields. */
const BYTES = Buffer.from([
    ...[0xab, 0x01], // packet id header: 171 as a varuint32
    ...[0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01], // Raw ID, little-endian uint64
    ...[0x0a, ...Buffer.from('photo.jpeg', 'utf8')], // Photo Name, 10 bytes
    ...[0x08, ...Buffer.from('My photo', 'utf8')] // Photo Item Name, 8 bytes
]);

describe('CreatePhotoPacket', () => {
    it('writes every field in the order protocol 2193 defines', () => {
        const buffer = new CreatePhotoPacket(DATA).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...BYTES]);
    });

    it('reads a hand-built buffer to its end', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new CreatePhotoPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('keeps the full 64 bits of the raw id', () => {
        const data: CreatePhoto = { rawId: 0xffffffffffffffffn, photoName: '', photoItemName: '' };
        const buffer = new CreatePhotoPacket(data).serialize(new NetworkBinaryStream());

        expect(new CreatePhotoPacket().deserialize(new NetworkBinaryStream(buffer))).toEqual(data);
    });
});
