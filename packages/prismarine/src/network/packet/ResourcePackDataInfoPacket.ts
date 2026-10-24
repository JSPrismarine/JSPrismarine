import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * What kind of pack is about to be sent, as the `Pack Type` byte numbers it.
 *
 * The packet docs give the field as a bare uint8. The names and numbers are Mojang's `PackType`
 * enum in the datagen snapshot behind `@jsprismarine/minecraft`
 * (`packages/minecraft/datagen/snapshot/enums.html`); gophertunnel uses the same numbers.
 */
export enum ResourcePackType {
    Invalid = 0,
    Addon = 1,
    Cached = 2,
    CopyProtected = 3,
    Behavior = 4,
    PersonaPiece = 5,
    Resources = 6,
    Skins = 7,
    WorldTemplate = 8
}

/**
 * Announces the size and shape of a resource pack the server is about to send in chunks.
 *
 * The client answers with one `ResourcePackChunkRequestPacket` per chunk, and the server
 * replies to each with a `ResourcePackChunkDataPacket`.
 *
 * Wire order at protocol 2193: `Resource Name` as a string, `Chunk Size` and
 * `Number of Chunks` as uint32 LE, `File Size` as a uint64 LE, `File Hash` as a varuint32
 * byte length followed by that many bytes, `Is Premium Pack` as a byte, then `Pack Type` as a
 * byte.
 *
 * Nothing sends this yet. The server announces no downloadable packs, so no client ever asks
 * for a chunk.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-data-info-packet/
 */
export default class ResourcePackDataInfoPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackDataInfoPacket;

    /** The pack id and version joined by an underscore, as `ResourcePacksInfoPacket` gave them. */
    public resourceName = '';

    /** The largest chunk in bytes. The client divides the file size by this to count chunks. */
    public chunkSize = 0;

    /** How many chunks the pack is split into. */
    public numberOfChunks = 0;

    /** The size of the whole zip in bytes. */
    public fileSize = 0n;

    /** A SHA256 digest of the zip, as raw bytes rather than text. */
    public fileHash: Buffer = Buffer.alloc(0);

    /** True when the player needs an entitlement to use the pack. */
    public isPremiumPack = false;

    public packType: ResourcePackType = ResourcePackType.Resources;

    /** Reads the pack name, its size, its hash and its type. */
    public decodePayload(): void {
        this.resourceName = NetworkUtil.readString(this);
        this.chunkSize = this.readUnsignedIntLE();
        this.numberOfChunks = this.readUnsignedIntLE();
        this.fileSize = this.readUnsignedLongLE();
        this.fileHash = this.read(this.readUnsignedVarInt());
        this.isPremiumPack = this.readBoolean();
        this.packType = this.readByte();
    }

    /** Writes the pack name, its size, its hash and its type. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.resourceName);
        this.writeUnsignedIntLE(this.chunkSize);
        this.writeUnsignedIntLE(this.numberOfChunks);
        this.writeUnsignedLongLE(this.fileSize);
        this.writeUnsignedVarInt(this.fileHash.byteLength);
        this.write(this.fileHash);
        this.writeBoolean(this.isPremiumPack);
        this.writeByte(this.packType);
    }
}
