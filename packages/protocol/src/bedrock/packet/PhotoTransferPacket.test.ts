import { describe, expect, it } from 'vitest';
import PhotoTransferPacket, { PhotoType } from './PhotoTransferPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x63]), // Header: id 99 as LEB128.
    Buffer.from([0x01, 0x61]), // Photo Name "a".
    Buffer.from([0x02, 0xde, 0xad]), // Photo Data, two bytes.
    Buffer.from([0x00]), // Book ID "".
    Buffer.from([0x01]), // Type PhotoItem.
    Buffer.from([0x02]), // Source Type Book.
    Buffer.from([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]), // Owner ID as an int64 LE.
    Buffer.from([0x01, 0x62]) // New Photo Name "b".
]);

describe('PhotoTransferPacket', () => {
    it('encodes the names, the image bytes and the owner in docs order', () => {
        const packet = Object.assign(new PhotoTransferPacket(), {
            photoName: 'a',
            photoData: Buffer.from([0xde, 0xad]),
            bookId: '',
            type: PhotoType.PhotoItem,
            sourceType: PhotoType.Book,
            ownerId: 0x0102030405060708n,
            newPhotoName: 'b'
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new PhotoTransferPacket(ENCODED);
        packet.decode();

        expect(packet.photoName).toBe('a');
        expect(packet.photoData).toEqual(Buffer.from([0xde, 0xad]));
        expect(packet.bookId).toBe('');
        expect(packet.type).toBe(PhotoType.PhotoItem);
        expect(packet.sourceType).toBe(PhotoType.Book);
        expect(packet.ownerId).toBe(0x0102030405060708n);
        expect(packet.newPhotoName).toBe('b');
        expect(packet.feof()).toBe(true);
    });
});
