/**
 * `ClientboundDataStorePacket`: the server's data store changes for the client's UI.
 *
 * The payload is one `Updates` list. Each entry is a Cereal tagged variant: a varuint32
 * selector with the values of {@link DataStoreEntryType}, then a `Data Store Update`, a
 * `Data Store Change` or a `Data Store Removal` in full. Strings are a varuint32 byte length
 * followed by UTF-8.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-data-store-packet/
 */
import DataStoreUpdate, { DataStoreValueType } from '../../structure/DataStoreUpdate';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { DataStoreValue } from '../../structure/DataStoreUpdate';
import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

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

/**
 * The `Data` one-of of a `Data Store Update`: a varuint32 selector with the values of
 * {@link DataStoreValueType}, then a little-endian double, one boolean byte or a string.
 */
const dataStoreValue = t.custom<DataStoreValue>(
    'DataStoreValue',
    (stream, value) => {
        stream.writeUnsignedVarInt(value.type);
        switch (value.type) {
            case DataStoreValueType.DOUBLE:
                stream.writeDoubleLE(value.value);
                break;
            case DataStoreValueType.BOOLEAN:
                t.bool.write(stream, value.value);
                break;
            case DataStoreValueType.STRING:
                t.string.write(stream, value.value);
                break;
        }
    },
    (stream) => {
        const type: DataStoreValueType = stream.readUnsignedVarInt();
        switch (type) {
            case DataStoreValueType.DOUBLE:
                return { type, value: stream.readDoubleLE() };
            case DataStoreValueType.BOOLEAN:
                return { type, value: t.bool.read(stream) };
            case DataStoreValueType.STRING:
                return { type, value: t.string.read(stream) };
            default:
                throw new Error(`Data store update has an unknown data type ${type}`);
        }
    }
);

/** The six fields of a `Data Store Update`, which `DataStoreUpdate` carries as a class. */
const dataStoreUpdateFields = t.record({
    /** `Data Store Name`. */
    dataStoreName: t.string,
    /** `Property`, the name of the property in the data store that changed. */
    property: t.string,
    /** `Path` through the property that needs updating. */
    path: t.string,
    /** `Data`, the value that is updating. */
    data: dataStoreValue,
    /** `Property Update Count`. */
    propertyUpdateCount: t.lu32,
    /** `Path Update Count`. */
    pathUpdateCount: t.lu32
});

/**
 * A `Data Store Update` as a {@link DataStoreUpdate}. `DataStoreUpdate.serialize` needs a
 * `NetworkBinaryStream`, which a layout's plain stream is not, so the six fields are
 * described here and the class is built from them.
 */
export const dataStoreUpdate = t.custom<DataStoreUpdate>(
    'Data Store Update',
    (stream, value) => dataStoreUpdateFields.write(stream, value),
    (stream) => {
        const fields = dataStoreUpdateFields.read(stream);
        return new DataStoreUpdate(
            fields.dataStoreName,
            fields.property,
            fields.path,
            fields.data,
            fields.propertyUpdateCount,
            fields.pathUpdateCount
        );
    }
);

/** Stands in for {@link propertyValue} inside its own list and map items, which it nests. */
const nestedPropertyValue = t.custom<DataStorePropertyValue>(
    'DataStorePropertyValue',
    (stream, value) => propertyValue.write(stream, value),
    (stream) => propertyValue.read(stream)
);

const propertyList = t.list(nestedPropertyValue);

const propertyMap = t.list(t.record({ key: t.string, value: nestedPropertyValue }));

/**
 * `The New Property Value`: a little-endian int32 type tag with the values of
 * {@link DataStorePropertyType}, then the value the tag announces.
 */
const propertyValue: WireType<DataStorePropertyValue> = t.custom(
    'DataStorePropertyValue',
    (stream, value) => {
        t.li32.write(stream, value.type);
        switch (value.type) {
            case DataStorePropertyType.NONE:
                break;
            case DataStorePropertyType.BOOL:
                t.bool.write(stream, value.value);
                break;
            case DataStorePropertyType.INT64:
                t.li64.write(stream, value.value);
                break;
            case DataStorePropertyType.DOUBLE:
                stream.writeDoubleLE(value.value);
                break;
            case DataStorePropertyType.STRING:
                t.string.write(stream, value.value);
                break;
            case DataStorePropertyType.LIST:
                propertyList.write(stream, value.value);
                break;
            case DataStorePropertyType.MAP:
                propertyMap.write(stream, value.value);
                break;
        }
    },
    (stream) => {
        const type: DataStorePropertyType = t.li32.read(stream);
        switch (type) {
            case DataStorePropertyType.NONE:
                return { type };
            case DataStorePropertyType.BOOL:
                return { type, value: t.bool.read(stream) };
            case DataStorePropertyType.INT64:
                return { type, value: t.li64.read(stream) };
            case DataStorePropertyType.DOUBLE:
                return { type, value: stream.readDoubleLE() };
            case DataStorePropertyType.STRING:
                return { type, value: t.string.read(stream) };
            case DataStorePropertyType.LIST:
                return { type, value: propertyList.read(stream) };
            case DataStorePropertyType.MAP:
                return { type, value: propertyMap.read(stream) };
            default:
                throw new Error(`Data store property value has an unknown type ${type}`);
        }
    }
);

/** The fields of a `Data Store Change`, in wire order. */
const dataStoreChange = t.record({
    /** `Data Store Name`. */
    dataStoreName: t.string,
    /** `Property`, the name of the property in the data store that changed. */
    property: t.string,
    /** `Update Count`: how many times the property has updated. */
    updateCount: t.lu32,
    /** `The New Property Value`. */
    value: propertyValue
});

/** The `Data Store Name` of a `Data Store Removal`, its only field. */
const dataStoreRemoval = t.record({ dataStoreName: t.string });

/**
 * One `Updates` entry: the varuint32 selector, then the alternative it names. The alternative
 * depends on the selector's value, so the pair is one wire type.
 */
const dataStoreEntry = t.custom<DataStoreEntry>(
    'DataStoreEntry',
    (stream, entry) => {
        stream.writeUnsignedVarInt(entry.type);
        switch (entry.type) {
            case DataStoreEntryType.UPDATE:
                dataStoreUpdate.write(stream, entry.update);
                break;
            case DataStoreEntryType.CHANGE:
                dataStoreChange.write(stream, entry.change);
                break;
            case DataStoreEntryType.REMOVAL:
                dataStoreRemoval.write(stream, entry.removal);
                break;
        }
    },
    (stream) => {
        const type: DataStoreEntryType = stream.readUnsignedVarInt();
        switch (type) {
            case DataStoreEntryType.UPDATE:
                return { type, update: dataStoreUpdate.read(stream) };
            case DataStoreEntryType.CHANGE:
                return { type, change: dataStoreChange.read(stream) };
            case DataStoreEntryType.REMOVAL:
                return { type, removal: dataStoreRemoval.read(stream) };
            default:
                throw new Error(`Data store entry has an unknown type ${type}`);
        }
    }
);

/** The fields of a `ClientboundDataStorePacket`. */
export const clientboundDataStorePacket = definePacket('ClientboundDataStorePacket', {
    /** `Updates`: the changes, updates, and removals that happened to the data store, at most 500. */
    updates: t.list(dataStoreEntry)
});

/** Payload carried by `ClientboundDataStorePacket`. */
export type ClientboundDataStore = PayloadOf<typeof clientboundDataStorePacket>;
