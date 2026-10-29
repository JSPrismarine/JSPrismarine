import DataPacket from './DataPacket';

/**
 * The client's periodic report of which chunk blobs it has and which it is missing.
 *
 * Wire layout at protocol 2193: Missing Ids as a varuint32 count of uint64 LE hashes, then
 * Found Ids in the same form. Mojang's note on the Cereal conversion (ADO 1418566) says each
 * count sits beside its own list, where older protocols wrote both counts before either list.
 * Only a client that offered a blob cache sends it, and only once the server has marked a chunk
 * packet as cached.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/client-cache-blob-status-packet/
 */
export default class ClientCacheBlobStatusPacket extends DataPacket {
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
