import { DataItemType } from '@jsprismarine/minecraft';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder } from 'node_modules/@jsprismarine/nbt/src/ByteOrder';
import type { NetworkBinaryStream } from '../';
import { BlockPos, NetworkStructure, Vec3 } from '../';

type DataItemValue = number | bigint | string | NBTTagCompound | BlockPos | Vec3;

/**
 * Represents the network structure of the data linked to a entity.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/DataItem.html}
 */
export class DataItem extends NetworkStructure {
    public constructor(
        private id: number,
        private type: DataItemType,
        private value: DataItemValue
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedVarInt(this.id);
        stream.writeSignedByte(this.type);
        switch (this.type) {
            case DataItemType.BYTE:
                stream.writeByte(this.value as number);
                break;
            case DataItemType.SHORT:
                stream.writeShortLE(this.value as number);
                break;
            case DataItemType.INT:
                stream.writeVarInt(this.value as number);
                break;
            case DataItemType.FLOAT:
                stream.writeFloatLE(this.value as number);
                break;
            case DataItemType.STRING:
                stream.writeString(this.value as string);
                break;
            case DataItemType.COMPOUND_TAG:
                (this.value as NBTTagCompound).writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
                break;
            case DataItemType.POS:
                (this.value as BlockPos).serialize(stream);
                break;
            case DataItemType.LONG:
                stream.writeLongLE(this.value as bigint);
                break;
            case DataItemType.VEC3:
                (this.value as Vec3).serialize(stream);
                break;
        }
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.id = stream.readUnsignedVarInt();
        this.type = stream.readSignedByte();
        switch (this.type) {
            case DataItemType.BYTE:
                this.value = stream.readByte();
                break;
            case DataItemType.SHORT:
                this.value = stream.readShortLE();
                break;
            case DataItemType.INT:
                this.value = stream.readVarInt();
                break;
            case DataItemType.FLOAT:
                this.value = stream.readFloatLE();
                break;
            case DataItemType.STRING:
                this.value = stream.readString();
                break;
            case DataItemType.COMPOUND_TAG:
                this.value = NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true);
                break;
            case DataItemType.POS:
                this.value = BlockPos.deserialize(stream);
                break;
            case DataItemType.LONG:
                this.value = stream.readLongLE();
                break;
            case DataItemType.VEC3:
                this.value = Vec3.deserialize(stream);
                break;
        }
    }
}
