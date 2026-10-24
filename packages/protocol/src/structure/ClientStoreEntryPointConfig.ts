import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * A `clientStoreEntryPointConfig`: the store a server's marketplace entry point opens, as
 * `ServerStoreInfoPacket` and `Server Configuration Join Info` (inside `StartGamePacket`)
 * carry it.
 *
 * Protocol 2193 wire order: `storeId` then `storeName`, both strings (a varuint32 byte length
 * followed by UTF-8).
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/client-store-entry-point-config/}
 */
export default class ClientStoreEntryPointConfig extends NetworkStructure {
    public constructor(
        /** `storeId`, the store's unique identifier. */
        public storeId = '',
        /** `storeName`, the name the client shows for the store. */
        public storeName = ''
    ) {
        super();
    }

    /** Writes `storeId` then `storeName`. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.storeId);
        stream.writeString(this.storeName);
    }

    /** Reads `storeId` then `storeName`. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.storeId = stream.readString();
        this.storeName = stream.readString();
    }
}
