import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * The client's periodic report of which chunk blobs it has and which it is missing.
 *
 * Wire layout at protocol 2193: Missing Ids as a varuint32 count of uint64 LE hashes, then
 * Found Ids in the same form. Only a client that offered a blob cache sends it, and only once
 * the server has marked a chunk packet as cached.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/client-cache-blob-status-packet/
 */
export default class ClientCacheBlobStatusPacket extends DataPacket {
    public static NetID = Identifiers.ClientCacheBlobStatusPacket;

    /** Blob hashes the client needs the server to send in full. */
    public missingIds: bigint[] = [];

    /** Blob hashes the client already holds. */
    public foundIds: bigint[] = [];

    /** Reads both hash lists. */
    public decodePayload(): void {
        this.missingIds = this.readHashes();
        this.foundIds = this.readHashes();
    }

    /** Writes both hash lists. */
    public encodePayload(): void {
        this.writeHashes(this.missingIds);
        this.writeHashes(this.foundIds);
    }

    private readHashes(): bigint[] {
        const count = this.readUnsignedVarInt();
        const hashes: bigint[] = [];
        for (let index = 0; index < count; index++) hashes.push(this.readUnsignedLongLE());

        return hashes;
    }

    private writeHashes(hashes: bigint[]): void {
        this.writeUnsignedVarInt(hashes.length);
        for (const hash of hashes) this.writeUnsignedLongLE(hash);
    }
}
