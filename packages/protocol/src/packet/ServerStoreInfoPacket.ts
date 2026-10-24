import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import ClientStoreEntryPointConfig from '../structure/ClientStoreEntryPointConfig';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ServerStoreInfoPacket`, in wire order. */
export interface ServerStoreInfo {
    /** `client_store_entry_point_configuration`, the store the client's marketplace entry point opens. */
    clientStoreEntryPointConfiguration: ClientStoreEntryPointConfig;
}

/**
 * Points the client's marketplace entry point at a server's store.
 *
 * Protocol 2193 layout, in wire order: `client_store_entry_point_configuration` as a
 * {@link ClientStoreEntryPointConfig}, which is `storeId` then `storeName`, both strings (a
 * varuint32 byte length followed by UTF-8). Nothing else follows. The schema marks the
 * configuration required, so no presence byte precedes it; gophertunnel master wraps it in
 * an optional, which the docs do not support.
 *
 * The packet arrived at protocol 2193 together with `ServerPresenceInfoPacket`. Mojang's
 * notes split the mutable store and presence configuration out of the immutable gathering
 * data in `StartGamePacket`'s `Server Configuration Join Info`, which still carries both for
 * the initial join; this packet changes the store configuration afterwards.
 */
export default class ServerStoreInfoPacket extends NetworkPacket<ServerStoreInfo> {
    public get id(): number {
        return PacketIdentifier.SERVER_STORE_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerStoreInfo): void {
        data.clientStoreEntryPointConfiguration.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerStoreInfo {
        return { clientStoreEntryPointConfiguration: ClientStoreEntryPointConfig.deserialize(stream) };
    }
}
