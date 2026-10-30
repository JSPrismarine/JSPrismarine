import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * One entity property update: the property's index in the entity definition and its new value.
 */
export interface PropertySyncEntry {
    /** Property Index, written as a varuint32. */
    index: number;
    /** Data. Written as a ZigZag varint32 for int properties and a little-endian float for float properties. */
    value: number;
}

/**
 * The 2193 `PropertySyncData` structure carried by `SetActorDataPacket`, `AddActorPacket` and
 * `AddPlayerPacket`.
 *
 * On the wire it is two lists. The Int Entries List is a varuint32 count followed by one
 * `Property Index` varuint32 and `Data` ZigZag varint32 per entry. The Float Entries List is a
 * varuint32 count followed by one `Property Index` varuint32 and `Data` little-endian float per
 * entry. Property indexes follow the client-synced definitions sent for the actor type.
 */
export class SyncedProperties {
    /** Int Entries List, in the order they are written. */
    public intProps: PropertySyncEntry[] = [];
    /** Float Entries List, in the order they are written. */
    public floatProps: PropertySyncEntry[] = [];

    /**
     * Write both lists in docs order: int entries, then float entries.
     */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.intProps.length);
        for (const { index, value } of this.intProps) {
            stream.writeUnsignedVarInt(index);
            stream.writeVarInt(value);
        }

        stream.writeUnsignedVarInt(this.floatProps.length);
        for (const { index, value } of this.floatProps) {
            stream.writeUnsignedVarInt(index);
            stream.writeFloatLE(value);
        }
    }

    /** Reads both lists in docs order, the mirror of {@link networkSerialize}. */
    public static networkDeserialize(stream: BinaryStream): SyncedProperties {
        const properties = new SyncedProperties();

        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            properties.intProps.push({ index: stream.readUnsignedVarInt(), value: stream.readVarInt() });
        }

        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            properties.floatProps.push({ index: stream.readUnsignedVarInt(), value: stream.readFloatLE() });
        }

        return properties;
    }
}
