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
 * One `DataItemEntry` of a `SynchedActorDataList`, the typed entity data an actor carries.
 *
 * Wire layout: `ID` (varuint32), then the `Payload`, which is a one-of. The one-of writes
 * its selector as a varuint32 and then the chosen variant, and every variant starts with its
 * own `Type` byte (uint8 `DataItemType`), so the type travels twice: once as the selector and
 * once inside the variant. The `Value` follows: `Byte` as int8, `Short` as int16 little
 * endian, `Int` as varint32, `Float` as float little endian, `String` as a string,
 * `CompoundTag` as network NBT, `Pos` as a `BlockPos` of three varint32, `Int64` as varint64,
 * `Vec3` as three floats.
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

    /** Writes the item in docs order: the id, the one-of selector, the variant's type byte, the value. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedVarInt(this.id);
        stream.writeUnsignedVarInt(this.entry.type);
        stream.writeByte(this.entry.type);
        switch (this.entry.type) {
            case DataItemType.BYTE:
                stream.writeSignedByte(this.entry.value);
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
                stream.writeVarLong(this.entry.value);
                break;
            case DataItemType.VEC3:
                this.entry.value.serialize(stream);
                break;
        }
    }

    /**
     * Reads the item from the stream.
     * @throws Error when the one-of selector and the variant's type byte disagree, or when
     * neither names a known {@link DataItemType}.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.id = stream.readUnsignedVarInt();
        const selector = stream.readUnsignedVarInt();
        const type: DataItemType = stream.readByte();
        if (selector !== type) {
            throw new Error(`Data item ${this.id} selects payload ${selector} but carries type ${type}`);
        }

        switch (type) {
            case DataItemType.BYTE:
                this.entry = { type, value: stream.readSignedByte() };
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
                this.entry = { type, value: stream.readVarLong() };
                break;
            case DataItemType.VEC3:
                this.entry = { type, value: Vec3.deserialize(stream) };
                break;
            default:
                throw new Error(`Data item ${this.id} has an unknown type ${type}`);
        }
    }
}
