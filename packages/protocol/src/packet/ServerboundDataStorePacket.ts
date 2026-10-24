import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import DataStoreUpdate from '../structure/DataStoreUpdate';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ServerboundDataStorePacket`, in wire order. */
export interface ServerboundDataStore {
    /** `Update`, the single data store update the client applies to the server's store. */
    update: DataStoreUpdate;
}

/**
 * One data store update from the client, for the server to apply to its store.
 *
 * Protocol 2193 layout: the payload is a single `Update`, a {@link DataStoreUpdate}:
 * `Data Store Name`, `Property` and `Path` as strings, the `Data` one-of (a varuint32
 * selector, then a little-endian double, one boolean byte, or a string), then
 * `Property Update Count` and `Path Update Count` as little-endian uint32. Strings are a
 * varuint32 byte length followed by UTF-8.
 *
 * Mojang split this packet and `ClientboundDataStorePacket` out of `DataStoreSyncPacket`
 * "for future use in UI". A retail client sends it only when a server-driven UI binds a
 * data store, so the server has nothing to handle today.
 */
export default class ServerboundDataStorePacket extends NetworkPacket<ServerboundDataStore> {
    public get id(): number {
        return PacketIdentifier.SERVERBOUND_DATA_STORE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundDataStore): void {
        data.update.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundDataStore {
        return { update: DataStoreUpdate.deserialize(stream) };
    }
}
