import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { clientboundDataStorePacket } from '../wire/definitions/clientboundDataStore';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';

import { DataStoreEntryType, DataStorePropertyType } from '../wire/definitions/clientboundDataStore';
export { DataStoreEntryType, DataStorePropertyType };
import type {
    ClientboundDataStore,
    DataStoreChange,
    DataStoreEntry,
    DataStoreMapEntry,
    DataStorePropertyValue,
    DataStoreRemoval,
    DataStoreVariableChange,
    DataStoreVariableEntry,
    DataStoreVariableRemoval,
    DataStoreVariableUpdate
} from '../wire/definitions/clientboundDataStore';
export type {
    ClientboundDataStore,
    DataStoreChange,
    DataStoreEntry,
    DataStoreMapEntry,
    DataStorePropertyValue,
    DataStoreRemoval,
    DataStoreVariableChange,
    DataStoreVariableEntry,
    DataStoreVariableRemoval,
    DataStoreVariableUpdate
};

/**
 * The server's data store changes for the client's UI, sent as a batch.
 *
 * Protocol 2193 and 2225 layout, which are identical (the docs list no change between them), in
 * wire order: `Updates` as a varuint32 entry count, then per entry a Cereal tagged variant: a
 * varuint32 selector with the values of {@link DataStoreEntryType}, then the alternative in full. A `Data Store Update` is a {@link DataStoreUpdate}
 * (`Data Store Name`, `Property`, `Path`, the `Data` one-of, then `Property Update Count`
 * and `Path Update Count` as little-endian uint32). A `Data Store Change` is
 * `Data Store Name`, `Property`, `Update Count` as a little-endian uint32, then
 * `The New Property Value` as a {@link DataStorePropertyValue}. A `Data Store Removal` is
 * `Data Store Name` alone. Strings are a varuint32 byte length followed by UTF-8.
 *
 * Mojang split this packet and `ServerboundDataStorePacket` out of `DataStoreSyncPacket` "for
 * future use in UI". The server has nothing to send in it today.
 */
export default class ClientboundDataStorePacket extends NetworkPacket<ClientboundDataStore> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_DATA_STORE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDataStore): void {
        layoutAt(clientboundDataStorePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDataStore {
        return layoutAt(clientboundDataStorePacket, this.codecProtocol).decode(stream);
    }
}
