import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** Where a photo lives, as the Type and Source Type bytes number it. */
export enum PhotoType {
    Portfolio = 0,
    PhotoItem = 1,
    Book = 2
}

/**
 * A photo taken with the Education Edition camera, moving between the client's photo storage
 * and the server's.
 *
 * Travels both ways. The client sends it when a photo is taken or pasted into a portfolio; the
 * server sends it to hand a stored photo back. An empty Photo Data means the client is asking
 * for the named photo rather than uploading one.
 *
 * Wire layout at protocol 2193: Photo Name, Photo Data and Book ID as strings, Type and Source
 * Type as `PhotoType` bytes, Owner ID as an int64 LE, then New Photo Name as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/photo-transfer-packet/
 */
export default class PhotoTransferPacket extends DataPacket {
    public static NetID = Identifiers.PhotoTransferPacket;

    /** File name the photo is stored under. */
    public photoName = '';

    /**
     * The encoded image.
     *
     * The docs call this a string, but it is a length prefixed run of PNG bytes, so it is kept
     * as a `Buffer` rather than being decoded as UTF-8. Empty means "send me this photo".
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

    /** Reads the names, the image bytes, both photo types and the owner. */
    public decodePayload(): void {
        this.photoName = NetworkUtil.readString(this);
        this.photoData = this.read(this.readUnsignedVarInt());
        this.bookId = NetworkUtil.readString(this);
        this.type = this.readByte();
        this.sourceType = this.readByte();
        this.ownerId = this.readLongLE();
        this.newPhotoName = NetworkUtil.readString(this);
    }

    /** Writes the names, the image bytes, both photo types and the owner. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.photoName);
        this.writeUnsignedVarInt(this.photoData.byteLength);
        this.write(this.photoData);
        NetworkUtil.writeString(this, this.bookId);
        this.writeByte(this.type);
        this.writeByte(this.sourceType);
        this.writeLongLE(this.ownerId);
        NetworkUtil.writeString(this, this.newPhotoName);
    }
}
