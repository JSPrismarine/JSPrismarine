import BinaryStream from '@jsprismarine/jsbinaryutils';
import { ByteOrder } from './ByteOrder';
import ByteVal from './types/ByteVal';
import DoubleVal from './types/DoubleVal';
import FloatVal from './types/FloatVal';
import LongVal from './types/LongVal';
import NumberVal from './types/NumberVal';
import ShortVal from './types/ShortVal';
import StringVal from './types/StringVal';

export default class NBTStreamReader {
    protected input: BinaryStream;
    protected byteOrder: ByteOrder;

    private useVarint = false;
    private allocateLimit = -1;

    protected constructor(input: any, byteOrder: ByteOrder) {
        this.input = input;
        this.byteOrder = byteOrder;
    }

    public isUsingVarint(): boolean {
        return this.useVarint;
    }

    public setUseVarint(useVarint: boolean): void {
        this.useVarint = useVarint;
    }

    public setAllocateLimit(allocateLimit: number): void {
        this.allocateLimit = allocateLimit;
    }

    protected readByteValue(): ByteVal {
        this.expectInput(1, 'Invalid NBT Data: Expected byte');
        return new ByteVal(this.input.readByte());
    }

    protected readStringValue(): StringVal {
        const length: number = this.useVarint ? this.input.readUnsignedVarInt() : this.readShortValue().getValue();
        this.expectInput(length, 'Invalid NBT Data: Expected string bytes');

        const data: Buffer = this.input.read(length);

        return new StringVal(data.toString('utf8'));
    }

    protected readShortValue(): ShortVal {
        this.expectInput(2, 'Invalid NBT Data: Expected short');

        if (this.byteOrder === ByteOrder.LITTLE_ENDIAN) {
            return new ShortVal(this.input.readShortLE());
        }

        return new ShortVal(this.input.readShort());
    }

    protected readIntValue(): NumberVal {
        if (this.useVarint) {
            return new NumberVal(this.input.readVarInt());
        }

        this.expectInput(4, 'Invalid NBT Data: Expected int');

        if (this.byteOrder === ByteOrder.LITTLE_ENDIAN) {
            return new NumberVal(this.input.readIntLE());
        }

        return new NumberVal(this.input.readInt());
    }

    protected readLongValue(): LongVal {
        if (this.useVarint) {
            return new LongVal(this.input.readVarLong());
        }

        this.expectInput(8, 'Invalid NBT Data: Expected long');

        if (this.byteOrder === ByteOrder.LITTLE_ENDIAN) {
            return new LongVal(this.input.readLongLE());
        }

        return new LongVal(this.input.readLong());
    }

    protected readFloatValue(): FloatVal {
        this.expectInput(4, 'Invalid NBT Data: Expected long');

        if (this.byteOrder === ByteOrder.LITTLE_ENDIAN) {
            return new FloatVal(this.input.readFloatLE());
        }

        return new FloatVal(this.input.readFloat());
    }

    protected readDoubleValue(): DoubleVal {
        this.expectInput(8, 'Invalid NBT Data: Expected double');

        if (this.byteOrder === ByteOrder.LITTLE_ENDIAN) {
            return new DoubleVal(this.input.readDoubleLE());
        }

        return new DoubleVal(this.input.readDouble());
    }

    protected readByteArrayValue(): Buffer {
        const size: number = this.readIntValue().getValue();
        this.expectInput(size, 'Invalid NBT Data: Expected byte array data');
        return this.input.read(size);
    }

    protected readIntArrayValue(): number[] {
        const size: number = this.readIntValue().getValue();
        this.expectInput(this.isUsingVarint() ? size : size * 4, 'Invalid NBT Data: Expected int array data');
        const result: number[] = [];
        for (let i = 0; i < size; i++) {
            result.push(this.readIntValue().getValue());
        }

        return result;
    }

    protected expectInput(remaining: number, message: string, alterAllocationLimit = true): void {
        if (alterAllocationLimit) {
            this.alterAllocationLimit(remaining);
        }

        const length = this.input.readRemaining().byteLength;
        this.input.skip(-length);
        if (length < remaining) {
            throw new Error(message);
        }
    }

    public alterAllocationLimit(remaining: number): void {
        if (this.allocateLimit !== -1) {
            if (this.allocateLimit - remaining < 0) {
                throw new Error('Could not allocate more bytes due to reaching the set limit');
            } else {
                this.allocateLimit -= remaining;
            }
        }
    }
}
