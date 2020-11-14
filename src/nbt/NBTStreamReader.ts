import BinaryStream from "@jsprismarine/jsbinaryutils";
import { ByteOrder } from "./ByteOrder";

export default class NBTStreamReader {
    protected input: BinaryStream;
    protected byteOrder: ByteOrder;

    private useVarint: boolean = false;
    private allocateLimit: number = -1;

    protected constructor(input: BinaryStream, byteOrder: ByteOrder) {
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

    protected readByteValue(): number {
        this.expectInput(1, 'Invalid NBT Data: Expected byte');
        return this.input.readByte();
    }

    protected readStringValue(): string {
        let length: number = this.useVarint ? this.input.readUnsignedVarInt() : this.readShortValue();
        this.expectInput(length, 'Invalid NBT Data: Expected string bytes');

        let data: Buffer = this.input.read(length);

        return data.toString('utf8');
    }

    protected readShortValue(): number {
        this.expectInput(2, 'Invalid NBT Data: Expected short');

        if (this.byteOrder == ByteOrder.LITTLE_ENDIAN) {
            return this.input.readLShort();
        } 
        
        return this.input.readShort();
    }

    protected readIntValue(): number {
        if (this.useVarint) {
            return this.input.readVarInt();
        }
        
        this.expectInput(4, 'Invalid NBT Data: Expected int');

        if (this.byteOrder == ByteOrder.LITTLE_ENDIAN) {
            return this.input.readLInt();
        } 
            
        return this.input.readInt();
    }

    protected readLongValue(): bigint {
        if (this.useVarint) {
            return this.input.readVarLong();
        } else {
            this.expectInput(8, 'Invalid NBT Data: Expected long');

            if (this.byteOrder == ByteOrder.LITTLE_ENDIAN) {
                return this.input.readLLong();
            } 

            return this.input.readLong();
        }
    }

    protected readFloatValue(): number {
        this.expectInput(4, 'Invalid NBT Data: Expected long');

        if (this.byteOrder == ByteOrder.LITTLE_ENDIAN) {
            return this.input.readLFloat();
        }

        return this.input.readFloat();
    }

    protected readDoubleValue(): number {
        this.expectInput(8, 'Invalid NBT Data: Expected double');

        if (this.byteOrder == ByteOrder.LITTLE_ENDIAN) {
            return this.input.readLDouble();
        }

        return this.input.readDouble();
    }

    protected readByteArrayValue(): Buffer {
        let size: number = this.readIntValue();
        this.expectInput(size, 'Invalid NBT Data: Expected byte array data');
        return this.input.read(size);
    }

    protected readIntArrayValue(): number[] {
        let size: number = this.readIntValue();
        this.expectInput(this.isUsingVarint() ? size : size * 4, 'Invalid NBT Data: Expected int array data');
        let result: number[] = [];
        for (let i = 0; i < size; i++) {
            result.push(this.readIntValue());
        }
        return result;
    }

    protected expectInput(remaining: number, message: string, alterAllocationLimit: boolean = true): void {
        if (alterAllocationLimit) {
            this.alterAllocationLimit(remaining);    
        }

        let len = this.input.readRemaining().length;
        this.input.addOffset(-len, false);
        if (len < remaining) {
            throw new Error(message);
        }
    }

    public alterAllocationLimit(remaining: number): void {
        if (this.allocateLimit != -1) {
            if (this.allocateLimit - remaining < 0) {
                throw new Error('Could not allocate more bytes due to reaching the set limit');
            } else {
                this.allocateLimit -= remaining;
            }
        }
    }
}