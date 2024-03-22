import type BinaryStream from '@jsprismarine/jsbinaryutils';
import { ByteOrder } from './ByteOrder';
import ByteVal from './types/ByteVal';
import DoubleVal from './types/DoubleVal';
import FloatVal from './types/FloatVal';
import LongVal from './types/LongVal';
import { NBTDefinitions } from './NBTDefinitions';
import NBTTagCompound from './NBTTagCompound';
import NumberVal from './types/NumberVal';
import ShortVal from './types/ShortVal';
import StringVal from './types/StringVal';

export default class NBTWriter {
    private readonly order: ByteOrder;
    private readonly buf: BinaryStream;

    private useVarint = false;

    public constructor(out: BinaryStream, byteOrder: ByteOrder) {
        this.buf = out;
        this.order = byteOrder;
    }

    public setUseVarint(useVarint: boolean): void {
        this.useVarint = useVarint;
    }

    public writeList(list: Set<any>): void {
        this.writeTagHeader(NBTDefinitions.TAG_LIST, '');
        this.writeListValue(list);
    }

    public writeCompound(compound: NBTTagCompound): void {
        this.writeTagHeader(NBTDefinitions.TAG_COMPOUND, compound.getName() ?? '');
        this.writeCompoundValue(compound);
    }

    private writeTagHeader(type: number, name: string): void {
        this.writeByteValue(type);
        this.writeStringValue(name);
    }

    private writeStringValue(value: string | null): void {
        if (value !== null) {
            const bytes = Buffer.from(value, 'utf8');
            if (this.useVarint) {
                this.buf.writeUnsignedVarInt(Buffer.byteLength(value));
            } else {
                this.writeShortValue(Buffer.byteLength(value));
            }

            this.buf.write(bytes);
        } else if (this.useVarint) {
            this.writeByteValue(0);
        } else {
            this.writeShortValue(0);
        }
    }

    public writeByteValue(value: number): void {
        this.buf.writeByte(value);
    }

    public writeShortValue(value: number): void {
        if (this.order === ByteOrder.LITTLE_ENDIAN) {
            this.buf.writeUnsignedShortLE(value);
        } else {
            this.buf.writeUnsignedShort(value);
        }
    }

    private writeIntegerValue(value: number): void {
        if (this.useVarint) {
            this.buf.writeVarInt(value);
        } else if (this.order === ByteOrder.LITTLE_ENDIAN) {
            this.buf.writeUnsignedIntLE(value);
        } else {
            this.buf.writeUnsignedInt(value);
        }
    }

    private writeLongValue(value: bigint): void {
        if (this.useVarint) {
            this.buf.writeVarLong(value);
        } else if (this.order === ByteOrder.LITTLE_ENDIAN) {
            this.buf.writeUnsignedLongLE(value);
        } else {
            this.buf.writeUnsignedLong(value);
        }
    }

    private writeFloatValue(value: number): void {
        if (this.order === ByteOrder.LITTLE_ENDIAN) {
            this.buf.writeFloatLE(value);
        } else {
            this.buf.writeFloat(value);
        }
    }

    private writeDoubleValue(value: number): void {
        if (this.order === ByteOrder.LITTLE_ENDIAN) {
            this.buf.writeDoubleLE(value);
        } else {
            this.buf.writeDouble(value);
        }
    }

    private writeByteArrayValue(value: Buffer): void {
        this.writeIntegerValue(value.length);
        this.buf.write(value);
    }

    private writeIntegerArrayValue(value: number[]) {
        this.writeIntegerValue(value.length);
        value.forEach((v) => {
            this.writeIntegerValue(v);
        });
    }

    private writeListValue(value: Set<any>): void {
        if (value.size > 0) {
            const listNbtType = this.getNBTTypeFromValue(value.entries().next().value);
            this.writeByteValue(listNbtType);
            this.writeIntegerValue(value.size);
            for (const rawValue of value) {
                switch (listNbtType) {
                    case NBTDefinitions.TAG_BYTE:
                        this.writeByteValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_SHORT:
                        this.writeShortValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_INT:
                        this.writeIntegerValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_LONG:
                        this.writeLongValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_FLOAT:
                        this.writeFloatValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_DOUBLE:
                        this.writeDoubleValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_BYTE_ARRAY:
                        this.writeDoubleValue(rawValue);
                        break;
                    case NBTDefinitions.TAG_STRING:
                        this.writeStringValue(rawValue.getValue());
                        break;
                    case NBTDefinitions.TAG_LIST:
                        this.writeListValue(rawValue);
                        break;
                    case NBTDefinitions.TAG_COMPOUND:
                        this.writeCompoundValue(rawValue);
                        break;
                    case NBTDefinitions.TAG_INT_ARRAY:
                        this.writeIntegerArrayValue(rawValue);
                        break;
                    default:
                        throw new Error('Invalid NBTTagType');
                }
            }
        } else {
            this.writeByteValue(NBTDefinitions.TAG_BYTE);
            this.writeIntegerValue(0);
        }
    }

    private writeCompoundValue(compound: NBTTagCompound): void {
        for (const [key, value] of compound.entries()) {
            const nbtType = this.getNBTTypeFromValue(value);
            this.writeTagHeader(nbtType, key);
            switch (nbtType) {
                case NBTDefinitions.TAG_BYTE:
                    this.writeByteValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_SHORT:
                    this.writeShortValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_INT:
                    this.writeIntegerValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_LONG:
                    this.writeLongValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_FLOAT:
                    this.writeFloatValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_DOUBLE:
                    this.writeDoubleValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_BYTE_ARRAY:
                    this.writeByteArrayValue(value);
                    break;
                case NBTDefinitions.TAG_STRING:
                    this.writeStringValue(value.getValue());
                    break;
                case NBTDefinitions.TAG_LIST:
                    this.writeListValue(value);
                    break;
                case NBTDefinitions.TAG_COMPOUND:
                    this.writeCompoundValue(value);
                    break;
                case NBTDefinitions.TAG_INT_ARRAY:
                    this.writeIntegerValue(value);
                    break;
                default:
                    throw new Error('Invalid NBTTagType');
            }
        }

        this.writeByteValue(NBTDefinitions.TAG_END);
    }

    private getNBTTypeFromValue(value: any): NBTDefinitions {
        if (value instanceof ByteVal) {
            return NBTDefinitions.TAG_BYTE;
        }
        if (value instanceof ShortVal) {
            return NBTDefinitions.TAG_SHORT;
        }
        if (value instanceof NumberVal) {
            return NBTDefinitions.TAG_INT;
        }
        if (value instanceof LongVal) {
            return NBTDefinitions.TAG_LONG;
        }
        if (value instanceof FloatVal) {
            return NBTDefinitions.TAG_FLOAT;
        }
        if (value instanceof DoubleVal) {
            return NBTDefinitions.TAG_DOUBLE;
        }
        if (value instanceof Buffer) {
            return NBTDefinitions.TAG_BYTE_ARRAY;
        }
        if (value instanceof StringVal) {
            return NBTDefinitions.TAG_STRING;
        }
        if (value instanceof Set) {
            return NBTDefinitions.TAG_LIST;
        }
        if (value instanceof NBTTagCompound) {
            return NBTDefinitions.TAG_COMPOUND;
        }
        if (Array.isArray(value)) {
            return NBTDefinitions.TAG_INT_ARRAY;
        }

        throw new TypeError(`Invalid NBT Data: Cannot deduce NBT type of class ${value.constructor.name} (${value})`);
    }
}
