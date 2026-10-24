import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** One chunk blob and the hash the client files it under. */
export interface MissingBlobData {
    /** xxHash of the payload, matching a hash the client reported as missing. */
    blobId: bigint;

    /** Sub chunk or biome data, the same bytes the chunk packet would otherwise have carried. */
    blobData: Buffer;
}

/**
 * The blobs a client said it did not have, sent in answer to `ClientCacheBlobStatusPacket`.
 *
 * This is how chunk data first reaches a client that uses the blob cache: the chunk packet
 * names its blobs by hash, and anything the client does not already hold comes through here.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Missing Blobs as a varuint32 count of entries, each a Blob Id
 * as a uint64 LE and Blob Data as a length prefixed byte run.
 *
 * This server keeps the blob cache off and never marks a chunk as cached, so it has no misses
 * to answer and never sends this. The decoder is here for the client package and the tests.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/client-cache-miss-response-packet/
 */
export default class ClientCacheMissResponsePacket extends DataPacket {
    public static NetID = Identifiers.ClientCacheMissResponsePacket;

    /** The blobs being delivered, in no particular order. */
    public blobs: MissingBlobData[] = [];

    /** Reads every hash and its payload. */
    public decodePayload(): void {
        this.blobs = [];

        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            const blobId = this.readUnsignedLongLE();
            this.blobs.push({ blobId, blobData: this.read(this.readUnsignedVarInt()) });
        }
    }

    /** Writes every hash and its payload. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.blobs.length);

        for (const blob of this.blobs) {
            this.writeUnsignedLongLE(blob.blobId);
            this.writeUnsignedVarInt(blob.blobData.byteLength);
            this.write(blob.blobData);
        }
    }
}
