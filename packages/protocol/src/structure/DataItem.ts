import { DataItemType } from '@jsprismarine/minecraft';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import BlockPos from './BlockPos';
import Vec3 from './Vec3';

/**
 * A typed entity data value. The `type` tag decides which encoding `value` uses on the wire,
 * so the two travel together instead of as separate fields.
 */
export type DataItemEntry =
    | { type: DataItemType.BYTE | DataItemType.SHORT | DataItemType.INT | DataItemType.FLOAT; value: number }
    | { type: DataItemType.STRING; value: string }
    | { type: DataItemType.COMPOUND_TAG; value: NBTTagCompound }
    | { type: DataItemType.POS; value: BlockPos }
    | { type: DataItemType.LONG; value: bigint }
    | { type: DataItemType.VEC3; value: Vec3 };

/**
 * Represents the network structure of the data linked to a entity.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/DataItem.html}
 */
export class DataItem extends NetworkStructure {
    /**
     * Creates a data item.
     * @param id - The entity data key the value belongs to.
     * @param entry - The typed value to carry.
     */
    public constructor(
        private id: number,
        private entry: DataItemEntry
    ) {
        super();
    }

    /** The entity data key this item sets. */
    public getId(): number {
        return this.id;
    }

    /** The wire type of the value. */
    public getType(): DataItemType {
        return this.entry.type;
    }

    /** The value, typed according to {@link DataItem.getType}. */
    public getValue(): DataItemEntry['value'] {
        return this.entry.value;
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedVarInt(this.id);
        stream.writeSignedByte(this.entry.type);
        switch (this.entry.type) {
            case DataItemType.BYTE:
                stream.writeByte(this.entry.value);
                break;
            case DataItemType.SHORT:
                stream.writeShortLE(this.entry.value);
                break;
            case DataItemType.INT:
                stream.writeVarInt(this.entry.value);
                break;
            case DataItemType.FLOAT:
                stream.writeFloatLE(this.entry.value);
                break;
            case DataItemType.STRING:
                stream.writeString(this.entry.value);
                break;
            case DataItemType.COMPOUND_TAG:
                this.entry.value.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
                break;
            case DataItemType.POS:
                this.entry.value.serialize(stream);
                break;
            case DataItemType.LONG:
                stream.writeLongLE(this.entry.value);
                break;
            case DataItemType.VEC3:
                this.entry.value.serialize(stream);
                break;
        }
    }

    /**
     * Reads the item from the stream.
     * @throws Error when the type byte is not a known {@link DataItemType}.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.id = stream.readUnsignedVarInt();
        const type: DataItemType = stream.readSignedByte();
        switch (type) {
            case DataItemType.BYTE:
                this.entry = { type, value: stream.readByte() };
                break;
            case DataItemType.SHORT:
                this.entry = { type, value: stream.readShortLE() };
                break;
            case DataItemType.INT:
                this.entry = { type, value: stream.readVarInt() };
                break;
            case DataItemType.FLOAT:
                this.entry = { type, value: stream.readFloatLE() };
                break;
            case DataItemType.STRING:
                this.entry = { type, value: stream.readString() };
                break;
            case DataItemType.COMPOUND_TAG:
                this.entry = { type, value: NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true) };
                break;
            case DataItemType.POS:
                this.entry = { type, value: BlockPos.deserialize(stream) };
                break;
            case DataItemType.LONG:
                this.entry = { type, value: stream.readLongLE() };
                break;
            case DataItemType.VEC3:
                this.entry = { type, value: Vec3.deserialize(stream) };
                break;
            default:
                throw new Error(`Data item ${this.id} has an unknown type ${type}`);
        }
    }
}
