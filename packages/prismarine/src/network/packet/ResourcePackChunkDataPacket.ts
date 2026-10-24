import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * One chunk of a resource pack zip, in answer to a `ResourcePackChunkRequestPacket`.
 *
 * Wire order at protocol 2193: `Resource Name` as a string, `Chunk ID` as a uint32 LE,
 * `Byte Offset` as a uint64 LE, then `Chunk Data` as a varuint32 byte length followed by that
 * many bytes. The chunk may be no larger than the `Chunk Size` announced in
 * `ResourcePackDataInfoPacket`.
 *
 * Nothing sends this yet. The server announces no downloadable packs, and
 * `ResourcePackChunkRequestHandler` disconnects a client that asks for a chunk anyway.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-chunk-data-packet/
 */
export default class ResourcePackChunkDataPacket extends DataPacket {
    public static NetID = Identifiers.ResourcePackChunkDataPacket;

    /** The pack id and version joined by an underscore, as the request named them. */
    public resourceName = '';

    /** The zero-based index of this chunk. */
    public chunkId = 0;

    /** Where this chunk starts in the zip, in bytes. */
    public byteOffset = 0n;

    /** The chunk's bytes. */
    public chunkData: Buffer = Buffer.alloc(0);

    /** Reads the pack name, the chunk index and offset, then the chunk itself. */
    public decodePayload(): void {
        this.resourceName = NetworkUtil.readString(this);
        this.chunkId = this.readUnsignedIntLE();
        this.byteOffset = this.readUnsignedLongLE();
        this.chunkData = this.read(this.readUnsignedVarInt());
    }

    /** Writes the pack name, the chunk index and offset, then the chunk itself. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.resourceName);
        this.writeUnsignedIntLE(this.chunkId);
        this.writeUnsignedLongLE(this.byteOffset);
        this.writeUnsignedVarInt(this.chunkData.byteLength);
        this.write(this.chunkData);
    }
}
