import { PhotoType, photoTransferPacket } from '../wire/definitions/photoTransfer';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

export { PhotoType };

/**
 * A photo taken with the Education Edition camera, moving between the client's photo storage
 * and the server's.
 *
 * Travels both ways. The client sends it when a photo is taken or pasted into a portfolio; the
 * server sends it to hand a stored photo back. An empty Photo Data means the client is asking
 * for the named photo rather than uploading one.
 *
 * Wire layout at protocols 2193 and 2225 (the 1.26.50 and 1.26.60 pages agree): Photo Name, Photo Data and Book ID as strings, Type and Source
 * Type as `PhotoType` bytes, Owner ID as an int64 LE, then New Photo Name as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/photo-transfer-packet/
 */
export default class PhotoTransferPacket extends FieldNetworkPacket {
    /** File name the photo is stored under. */
    public photoName = '';

    /**
     * The encoded image.
     *
     * The docs call this a string, which on the wire is the same varuint32 length prefix
     * followed by the bytes. Those bytes are an image file (the docs name `.jpeg` files), so
     * they are kept as a `Buffer` rather than decoded as UTF-8. Empty means "send me this photo".
     */
    public photoData: Buffer = Buffer.alloc(0);

    /** Portfolio or book the photo belongs to, empty when it belongs to neither. */
    public bookId = '';

    public type: PhotoType = PhotoType.Portfolio;

    /** Where the photo came from, which can differ from where it is going. */
    public sourceType: PhotoType = PhotoType.Portfolio;

    /** Unique id of the actor that owns the photo. */
    public ownerId = 0n;

    /** Name the photo should be stored under, used when a photo is renamed. */
    public newPhotoName = '';

    /** Writes the names, the image bytes, both photo types and the owner. */
    public encodePayload(): void {
        layoutAt(photoTransferPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(photoTransferPacket, this.codecProtocol).decode(this));
    }
}
