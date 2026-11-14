import BinaryStream from '@jsprismarine/binaryutils';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';
import { PhotoType, photoTransferPacket } from '../wire/definitions/photoTransfer';

/** Strings and the image carry a varuint32 byte length; the types are bytes; the owner is an int64 LE. */
const bytes = Buffer.from('0168020dea00010208070605040302010162', 'hex');
const payload = {
    photoName: 'h',
    photoData: Buffer.from([0x0d, 0xea]),
    bookId: '',
    type: PhotoType.PhotoItem,
    sourceType: PhotoType.Book,
    ownerId: 0x0102030405060708n,
    newPhotoName: 'b'
};

/** The 1.26.50 (2193) and 1.26.60 (2225) pages list the same seven fields and record no change. */
describe.each([2193, 2225])('the declarative PhotoTransfer layout at %i', (protocol) => {
    const layout = layoutAt(photoTransferPacket, protocol);

    it('writes the fields in docs order', () => {
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        expect(stream.getBuffer()).toEqual(bytes);
    });

    it('reads those bytes back', () => {
        expect(layout.decode(new BinaryStream(bytes))).toEqual(payload);
    });
});
