import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * The alternatives of a `Data Store Update`'s `Data` one-of, numbered by their position in
 * the schema's `oneOf`. The number is the varuint32 selector that precedes the value.
 */
export enum DataStoreValueType {
    /** `Variant 0`: a little-endian double. */
    DOUBLE = 0,
    /** `Variant 1`: one boolean byte. */
    BOOLEAN = 1,
    /** `Variant 2`: a string, at most 5000 bytes. */
    STRING = 2
}

/**
 * The `Data` of a `Data Store Update`. `type` is the one-of selector and decides how `value`
 * goes on the wire, so the two travel together.
 */
export type DataStoreValue =
    | { type: DataStoreValueType.DOUBLE; value: number }
    | { type: DataStoreValueType.BOOLEAN; value: boolean }
    | { type: DataStoreValueType.STRING; value: string };

/** The fields of a `Data Store Update`, in wire order. */
export interface DataStoreUpdateData {
    /** `Data Store Name`, 1 to 1000 bytes. */
    dataStoreName: string;
    /** `Property`, the name of the property in the data store that changed. */
    property: string;
    /** `Path` through the property that needs updating. Empty when the whole property changed. */
    path: string;
    /** `Data`, the value that is updating. */
    data: DataStoreValue;
    /**
     * `Property Update Count`: how many times the property has updated. Does not increment
     * unless the whole property updates.
     */
    propertyUpdateCount: number;
    /** `Path Update Count`: how many times the path has updated. Resets when the whole property changes. */
    pathUpdateCount: number;
}

/**
 * One path of one data store property and its new value, as `ClientboundDataStorePacket`
 * lists it and `ServerboundDataStorePacket` carries it.
 *
 * Protocol 2193 wire order:
 * 0. `Data Store Name`: string.
 * 1. `Property`: string.
 * 2. `Path`: string.
 * 3. `Data`: a Cereal tagged variant. A varuint32 selector with the values of
 *    {@link DataStoreValueType}, then the alternative: a little-endian double, one boolean
 *    byte, or a string.
 * 4. `Property Update Count`: little-endian uint32.
 * 5. `Path Update Count`: little-endian uint32.
 * Strings are a varuint32 byte length followed by UTF-8.
 *
 * The two counts replaced a single `Update Count` at 1.26.0.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/data-store-update/}
 */
export default class DataStoreUpdate extends NetworkStructure implements DataStoreUpdateData {
    /**
     * Creates an update from its fields. Every parameter has a default so the static
     * `deserialize` can construct an empty instance before reading the stream.
     * @param dataStoreName - `Data Store Name`.
     * @param property - `Property` within the data store.
     * @param path - `Path` within the property.
     * @param data - `Data`, the typed value.
     * @param propertyUpdateCount - `Property Update Count`.
     * @param pathUpdateCount - `Path Update Count`.
     */
    public constructor(
        public dataStoreName = '',
        public property = '',
        public path = '',
        public data: DataStoreValue = { type: DataStoreValueType.DOUBLE, value: 0 },
        public propertyUpdateCount = 0,
        public pathUpdateCount = 0
    ) {
        super();
    }

    /** Writes the six fields in wire order, the one-of selector before the value. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.dataStoreName);
        stream.writeString(this.property);
        stream.writeString(this.path);
        stream.writeUnsignedVarInt(this.data.type);
        switch (this.data.type) {
            case DataStoreValueType.DOUBLE:
                stream.writeDoubleLE(this.data.value);
                break;
            case DataStoreValueType.BOOLEAN:
                stream.writeBoolean(this.data.value);
                break;
            case DataStoreValueType.STRING:
                stream.writeString(this.data.value);
                break;
        }
        stream.writeUnsignedIntLE(this.propertyUpdateCount);
        stream.writeUnsignedIntLE(this.pathUpdateCount);
    }

    /**
     * Reads the six fields in wire order.
     * @throws Error when the `Data` selector names no known {@link DataStoreValueType}.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.dataStoreName = stream.readString();
        this.property = stream.readString();
        this.path = stream.readString();
        const type: DataStoreValueType = stream.readUnsignedVarInt();
        switch (type) {
            case DataStoreValueType.DOUBLE:
                this.data = { type, value: stream.readDoubleLE() };
                break;
            case DataStoreValueType.BOOLEAN:
                this.data = { type, value: stream.readBoolean() };
                break;
            case DataStoreValueType.STRING:
                this.data = { type, value: stream.readString() };
                break;
            default:
                throw new Error(
                    `Data store update ${this.dataStoreName}/${this.property} has an unknown data type ${type}`
                );
        }
        this.propertyUpdateCount = stream.readUnsignedIntLE();
        this.pathUpdateCount = stream.readUnsignedIntLE();
    }
}
