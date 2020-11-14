import BinaryStream from "@jsprismarine/jsbinaryutils";
import { ByteOrder } from "./ByteOrder";
import { NBTDefinitions } from "./NBTDefinitions";

export default class NBTWriter {
    private readonly MAX_SIZE = 10 * 1024 * 1024;

    private order: ByteOrder;
    private buf: BinaryStream;

    private useVarint: boolean = false;

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

    private writeTagHeader(type: number, name: string): void {
        this.writeByteValue(type);
        this.writeStringValue(name);
    }

    private writeStringValue(value: string): void {
        let bytes = Buffer.from(value, 'utf8');
        if (this.useVarint) {
            this.buf.writeUnsignedVarInt(bytes.length);
        } else {
            this.writeShortValue(bytes.length);
        }

        this.buf.append(bytes); 
    }

    // Our buffer auto increments its capacity
    // private ensureCapacity(capacity: number): void {
        // let targetCapacity: number = this.buf.getOffset() + capacity;
        // if (targetCapacity <= this.buf)
    // }
}