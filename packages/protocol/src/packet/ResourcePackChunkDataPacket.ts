import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { resourcePackChunkDataPacket } from '../wire/definitions/resourcePacks';

/**
 * One chunk of a resource pack zip, in answer to a `ResourcePackChunkRequestPacket`.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `resourcePackChunkDataPacket`
 * definition: `Resource Name` as a string, `Chunk ID` as a uint32 LE, `Byte Offset` as a
 * uint64 LE, then `Chunk Data` as a varuint32 byte length followed by that many bytes. The
 * chunk may be no larger than the `Chunk Size` announced in `ResourcePackDataInfoPacket`.
 *
 * Nothing sends this yet. The server announces no downloadable packs, and
 * `ResourcePackChunkRequestHandler` disconnects a client that asks for a chunk anyway.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-pack-chunk-data-packet/
 */
export default class ResourcePackChunkDataPacket extends FieldNetworkPacket {
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
        const read = layoutAt(resourcePackChunkDataPacket, this.codecProtocol).decode(this);
        this.resourceName = read.resourceName;
        this.chunkId = read.chunkId;
        this.byteOffset = read.byteOffset;
        this.chunkData = read.chunkData;
    }

    /** Writes the pack name, the chunk index and offset, then the chunk itself. */
    public encodePayload(): void {
        layoutAt(resourcePackChunkDataPacket, this.codecProtocol).encode(this, {
            resourceName: this.resourceName,
            chunkId: this.chunkId,
            byteOffset: this.byteOffset,
            chunkData: this.chunkData
        });
    }
}
