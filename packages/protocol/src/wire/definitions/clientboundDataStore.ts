/**
 * `ClientboundDataStorePacket`: the server's data store changes for the client's UI.
 *
 * The payload is one `Updates` list. Each entry is a Cereal tagged variant: a varuint32
 * selector with the values of {@link DataStoreEntryType}, then a `Data Store Update`, a
 * `Data Store Change` or a `Data Store Removal` in full. Strings are a varuint32 byte length
 * followed by UTF-8.
 *
 * Protocol 2259 flattened the records to variable names: a store name and a property became one
 * `Variable Name`, `Path` went away, and a change's dynamic value became the same three-way `Data`
 * an update carries. The entries travel under `variableUpdates` from 2259 and `updates` before.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-data-store-packet/
 */
import DataStoreUpdate, { DataStoreValueType } from '../../structure/DataStoreUpdate';
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2259, UNTIL_2259 } from '../wireGates';

import type { DataStoreValue } from '../../structure/DataStoreUpdate';
import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

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
                throw new ProtocolWireErrors.UnknownDataStoreUpdateType({ type });
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
                throw new ProtocolWireErrors.UnknownDataStorePropertyType({ type });
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
                throw new ProtocolWireErrors.UnknownDataStoreEntryType({ type });
        }
    }
);

/** A `Data Store Update` from protocol 2259: a value written to one variable. */
export interface DataStoreVariableUpdate {
    /** `Variable Name`. */
    variableName: string;
    /** `Data`, the new value. */
    data: DataStoreValue;
    /** `Update Count`: how many times the variable has updated. */
    updateCount: number;
}

/** A `Data Store Change` from protocol 2259: a variable's new value, carried like an update's. */
export interface DataStoreVariableChange {
    /** `Variable Name`. */
    variableName: string;
    /** `Update Count`: how many times the variable has updated. */
    updateCount: number;
    /** `The New Variable Value`. */
    value: DataStoreValue;
}

/** A `Data Store Removal` from protocol 2259: a variable that is gone. */
export interface DataStoreVariableRemoval {
    /** `Variable Name`. */
    variableName: string;
}

/** One `Updates` entry from protocol 2259, selected the same way as {@link DataStoreEntry}. */
export type DataStoreVariableEntry =
    | { type: DataStoreEntryType.UPDATE; update: DataStoreVariableUpdate }
    | { type: DataStoreEntryType.CHANGE; change: DataStoreVariableChange }
    | { type: DataStoreEntryType.REMOVAL; removal: DataStoreVariableRemoval };

/** `Data Store Update` from protocol 2259: `Variable Name`, `Data`, `Update Count`. */
export const dataStoreVariableUpdate = t.record({
    /** [0] `Variable Name`. */
    variableName: t.string,
    /** [1] `Data`. */
    data: dataStoreValue,
    /** [2] `Update Count`. */
    updateCount: t.lu32
});

/** `Data Store Change` from protocol 2259: `Variable Name`, `Update Count`, `The New Variable Value`. */
const dataStoreVariableChange = t.record({
    /** [0] `Variable Name`. */
    variableName: t.string,
    /** [1] `Update Count`. */
    updateCount: t.lu32,
    /** [2] `The New Variable Value`. */
    value: dataStoreValue
});

/** `Data Store Removal` from protocol 2259: its `Variable Name`. */
const dataStoreVariableRemoval = t.record({ variableName: t.string });

/** One `Updates` entry from protocol 2259: the varuint32 selector, then the alternative it names. */
const dataStoreVariableEntry = t.custom<DataStoreVariableEntry>(
    'DataStoreEntry[2259]',
    (stream, entry) => {
        stream.writeUnsignedVarInt(entry.type);
        switch (entry.type) {
            case DataStoreEntryType.UPDATE:
                dataStoreVariableUpdate.write(stream, entry.update);
                break;
            case DataStoreEntryType.CHANGE:
                dataStoreVariableChange.write(stream, entry.change);
                break;
            case DataStoreEntryType.REMOVAL:
                dataStoreVariableRemoval.write(stream, entry.removal);
                break;
        }
    },
    (stream) => {
        const type: DataStoreEntryType = stream.readUnsignedVarInt();
        switch (type) {
            case DataStoreEntryType.UPDATE:
                return { type, update: dataStoreVariableUpdate.read(stream) };
            case DataStoreEntryType.CHANGE:
                return { type, change: dataStoreVariableChange.read(stream) };
            case DataStoreEntryType.REMOVAL:
                return { type, removal: dataStoreVariableRemoval.read(stream) };
            default:
                throw new ProtocolWireErrors.UnknownDataStoreEntryType({ type });
        }
    }
);

/** The fields of a `ClientboundDataStorePacket`. */
export const clientboundDataStorePacket = definePacket('ClientboundDataStorePacket', {
    /** `Updates` before protocol 2259: the changes, updates, and removals, at most 500. Empty from 2259. */
    updates: gated(UNTIL_2259, t.list(dataStoreEntry), []),
    /** `Updates` from protocol 2259, keyed by variable name. Empty before 2259. */
    variableUpdates: gated(SINCE_2259, t.list(dataStoreVariableEntry), [])
});

/** Payload carried by `ClientboundDataStorePacket`. */
export type ClientboundDataStore = PayloadOf<typeof clientboundDataStorePacket>;
