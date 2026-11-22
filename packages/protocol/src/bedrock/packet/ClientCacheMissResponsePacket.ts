import { clientCacheMissResponsePacket } from '../wire/definitions/clientCacheMissResponse';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';
import type { ClientCacheMissResponsePayload } from '../wire/definitions/clientCacheMissResponse';

/**
 * One chunk blob and the hash the client files it under.
 *
 * `blobId` is the XXHash64 of the payload as a little endian uint64, matching a hash the client
 * reported as missing. `blobData` is the sub chunk or biome data the chunk packet would
 * otherwise have carried.
 */
export type MissingBlobData = ClientCacheMissResponsePayload['blobs'][number];

/**
 * The blobs a client said it did not have, sent in answer to `ClientCacheBlobStatusPacket`.
 *
 * This is how chunk data first reaches a client that uses the blob cache: the chunk packet
 * names its blobs by hash, and anything the client does not already hold comes through here.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: Missing Blobs as a varuint32 count of entries, each a Blob Id
 * as a uint64 LE and Blob Data as a string, which is a varuint32 byte length then the bytes.
 *
 * A Blob Id is the XXHash64 of its Blob Data, read as a little endian uint64. The client
 * records every id it reported missing, and it disconnects on an id it never asked for or on
 * data whose hash does not match the id, so a sender has to use that hash and answer only
 * what was requested.
 *
 * The server answers misses for cached request-mode sub chunks with this packet. The same
 * packet also supports the older LevelChunk blob layout.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-miss-response-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/guides/client-cache-miss-response-packet-validation/
 */
export default class ClientCacheMissResponsePacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientCacheMissResponsePacket';
    }

    /** The blobs being delivered, in no particular order. */
    public blobs: MissingBlobData[] = [];

    /** Reads every hash and its payload. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientCacheMissResponsePacket, this.codecProtocol).decode(this));
    }

    /** Writes every hash and its payload. */
    public encodePayload(): void {
        layoutAt(clientCacheMissResponsePacket, this.codecProtocol).encode(this, this);
    }
}
