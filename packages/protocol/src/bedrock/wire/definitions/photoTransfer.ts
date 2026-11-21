/**
 * `PhotoTransferPacket`: a photo taken with the Education Edition camera, moving between the
 * client's photo storage and the server's.
 *
 * Field names and order follow the docs' packet page.
 * Photo Data is typed a string there, which on the wire is the same varuint32 length prefix
 * followed by the bytes; those bytes are an image file, so the layout keeps them as a `Buffer`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/photo-transfer-packet/}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** Where a photo lives, as the Type and Source Type bytes number it. */
export enum PhotoType {
    Portfolio = 0,
    PhotoItem = 1,
    Book = 2
}

/** The `PhotoTransferPacket` field list; the module doc carries the wire provenance. */
export const photoTransferPacket = definePacket('PhotoTransferPacket', {
    /** `Photo Name`: file name the photo is stored under. */
    photoName: t.string,
    /** `Photo Data`: the encoded image; empty means "send me this photo". */
    photoData: t.byteArray,
    /** `Book ID`: portfolio or book the photo belongs to, empty when it belongs to neither. */
    bookId: t.string,
    /** `Type`: where the photo is going; see {@link PhotoType}. */
    type: t.enumOf<PhotoType>(t.uint8),
    /** `Source Type`: where the photo came from; see {@link PhotoType}. */
    sourceType: t.enumOf<PhotoType>(t.uint8),
    /** `Owner ID`: unique id of the actor that owns the photo. */
    ownerId: t.li64,
    /** `New Photo Name`: name the photo should be stored under when it is renamed. */
    newPhotoName: t.string
});

/** Moves a photo between the client's photo storage and the server's. */
export type PhotoTransferPayload = PayloadOf<typeof photoTransferPacket>;
