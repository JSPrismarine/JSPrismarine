import { clientCacheBlobStatusPacket } from '../wire/definitions/clientCacheBlobStatus';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * The client's periodic report of which chunk blobs it has and which it is missing.
 *
 * Wire layout: Missing Ids as a varuint32 count of uint64 LE
 * hashes, then Found Ids in the same form. Only a client that offered a blob cache sends it, and
 * only once the server has marked a chunk packet as cached.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/client-cache-blob-status-packet/
 */
export default class ClientCacheBlobStatusPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ClientCacheBlobStatusPacket';
    }

    /** Blob hashes the client needs the server to send in full. */
    public missingIds: bigint[] = [];

    /** Blob hashes the client already holds. */
    public foundIds: bigint[] = [];

    /** Reads both hash lists. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(clientCacheBlobStatusPacket, this.codecProtocol).decode(this));
    }

    /** Writes both hash lists. */
    public encodePayload(): void {
        layoutAt(clientCacheBlobStatusPacket, this.codecProtocol).encode(this, this);
    }
}
