import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import DataStoreUpdate from '../structure/DataStoreUpdate';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The alternatives of an `Updates` entry, numbered by their position in the schema's
 * `oneOf`. The number is the varuint32 selector that opens each entry.
 */
export enum DataStoreEntryType {
    /** A `Data Store Update`: one path of one property and its new value. */
    UPDATE = 0,
    /** A `Data Store Change`: a whole property and its new value. */
    CHANGE = 1,
    /** A `Data Store Removal`: a whole data store is gone. */
    REMOVAL = 2
}

/**
 * The type tag of a `Data Store Change`'s `The New Property Value`. The docs describe the
 * field only as "Dynamic value"; the numbers and encodings are gophertunnel's for
 * protocol 2193.
 */
export enum DataStorePropertyType {
    /** No value follows. */
    NONE = 0,
    /** One boolean byte. */
    BOOL = 1,
    /** A little-endian int64. */
    INT64 = 2,
    /** A little-endian double. */
    DOUBLE = 3,
    /** A string. */
    STRING = 4,
    /** A varuint32 count, then that many property values. */
    LIST = 5,
    /** A varuint32 count, then that many string keys each followed by a property value. */
    MAP = 6
}

/** One key of a `MAP` property value and the value it maps to. */
export interface DataStoreMapEntry {
    /** The map key. */
    key: string;
    /** The value the key maps to. */
    value: DataStorePropertyValue;
}

/**
 * `The New Property Value` of a `Data Store Change`: a little-endian int32 type tag with the
 * values of {@link DataStorePropertyType}, then the value the tag announces. Lists and maps
 * nest further values.
 */
export type DataStorePropertyValue =
    | { type: DataStorePropertyType.NONE }
    | { type: DataStorePropertyType.BOOL; value: boolean }
    | { type: DataStorePropertyType.INT64; value: bigint }
    | { type: DataStorePropertyType.DOUBLE; value: number }
    | { type: DataStorePropertyType.STRING; value: string }
    | { type: DataStorePropertyType.LIST; value: DataStorePropertyValue[] }
    | { type: DataStorePropertyType.MAP; value: DataStoreMapEntry[] };

/** The fields of a `Data Store Change`, in wire order. */
export interface DataStoreChange {
    /** `Data Store Name`. */
    dataStoreName: string;
    /** `Property`, the name of the property in the data store that changed. */
    property: string;
    /** `Update Count`: how many times the property has updated. */
    updateCount: number;
    /** `The New Property Value`. */
    value: DataStorePropertyValue;
}

/** The fields of a `Data Store Removal`, in wire order. */
export interface DataStoreRemoval {
    /** `Data Store Name` of the store that was removed. */
    dataStoreName: string;
}

/**
 * One `Updates` entry. `type` is the one-of selector and decides which alternative follows
 * it on the wire.
 */
export type DataStoreEntry =
    | { type: DataStoreEntryType.UPDATE; update: DataStoreUpdate }
    | { type: DataStoreEntryType.CHANGE; change: DataStoreChange }
    | { type: DataStoreEntryType.REMOVAL; removal: DataStoreRemoval };

/** The fields of a `ClientboundDataStorePacket`, in wire order. */
export interface ClientboundDataStore {
    /** `Updates`: the changes, updates, and removals that happened to the data store, at most 500. */
    updates: DataStoreEntry[];
}

/**
 * The server's data store changes for the client's UI, sent as a batch.
 *
 * Protocol 2193 layout, in wire order: `Updates` as a varuint32 entry count, then per entry a
 * Cereal tagged variant: a varuint32 selector with the values of {@link DataStoreEntryType},
 * then the alternative in full. A `Data Store Update` is a {@link DataStoreUpdate}
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

    private static writePropertyValue(stream: NetworkBinaryStream, value: DataStorePropertyValue): void {
        stream.writeIntLE(value.type);
        switch (value.type) {
            case DataStorePropertyType.NONE:
                break;
            case DataStorePropertyType.BOOL:
                stream.writeBoolean(value.value);
                break;
            case DataStorePropertyType.INT64:
                stream.writeLongLE(value.value);
                break;
            case DataStorePropertyType.DOUBLE:
                stream.writeDoubleLE(value.value);
                break;
            case DataStorePropertyType.STRING:
                stream.writeString(value.value);
                break;
            case DataStorePropertyType.LIST:
                stream.writeUnsignedVarInt(value.value.length);
                for (const item of value.value) {
                    ClientboundDataStorePacket.writePropertyValue(stream, item);
                }
                break;
            case DataStorePropertyType.MAP:
                stream.writeUnsignedVarInt(value.value.length);
                for (const entry of value.value) {
                    stream.writeString(entry.key);
                    ClientboundDataStorePacket.writePropertyValue(stream, entry.value);
                }
                break;
        }
    }

    private static readPropertyValue(stream: NetworkBinaryStream): DataStorePropertyValue {
        const type: DataStorePropertyType = stream.readIntLE();
        switch (type) {
            case DataStorePropertyType.NONE:
                return { type };
            case DataStorePropertyType.BOOL:
                return { type, value: stream.readBoolean() };
            case DataStorePropertyType.INT64:
                return { type, value: stream.readLongLE() };
            case DataStorePropertyType.DOUBLE:
                return { type, value: stream.readDoubleLE() };
            case DataStorePropertyType.STRING:
                return { type, value: stream.readString() };
            case DataStorePropertyType.LIST: {
                const items: DataStorePropertyValue[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) {
                    items.push(ClientboundDataStorePacket.readPropertyValue(stream));
                }
                return { type, value: items };
            }
            case DataStorePropertyType.MAP: {
                const entries: DataStoreMapEntry[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) {
                    entries.push({
                        key: stream.readString(),
                        value: ClientboundDataStorePacket.readPropertyValue(stream)
                    });
                }
                return { type, value: entries };
            }
            default:
                throw new Error(`Data store property value has an unknown type ${type}`);
        }
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ClientboundDataStore): void {
        stream.writeUnsignedVarInt(data.updates.length);
        for (const entry of data.updates) {
            stream.writeUnsignedVarInt(entry.type);
            switch (entry.type) {
                case DataStoreEntryType.UPDATE:
                    entry.update.serialize(stream);
                    break;
                case DataStoreEntryType.CHANGE:
                    stream.writeString(entry.change.dataStoreName);
                    stream.writeString(entry.change.property);
                    stream.writeUnsignedIntLE(entry.change.updateCount);
                    ClientboundDataStorePacket.writePropertyValue(stream, entry.change.value);
                    break;
                case DataStoreEntryType.REMOVAL:
                    stream.writeString(entry.removal.dataStoreName);
                    break;
            }
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundDataStore {
        const updates: DataStoreEntry[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const type: DataStoreEntryType = stream.readUnsignedVarInt();
            switch (type) {
                case DataStoreEntryType.UPDATE:
                    updates.push({ type, update: DataStoreUpdate.deserialize(stream) });
                    break;
                case DataStoreEntryType.CHANGE:
                    updates.push({
                        type,
                        change: {
                            dataStoreName: stream.readString(),
                            property: stream.readString(),
                            updateCount: stream.readUnsignedIntLE(),
                            value: ClientboundDataStorePacket.readPropertyValue(stream)
                        }
                    });
                    break;
                case DataStoreEntryType.REMOVAL:
                    updates.push({ type, removal: { dataStoreName: stream.readString() } });
                    break;
                default:
                    throw new Error(`Data store entry has an unknown type ${type}`);
            }
        }

        return { updates };
    }
}
