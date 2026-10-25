/**
 * A cursor over one saved LevelDB record, with the NBT dialect a Bedrock world writes.
 *
 * `@jsprismarine/nbt` reads the same dialect, and the server uses it. This job cannot: that
 * package reaches `@jsprismarine/binaryutils` through a bare specifier, both export TypeScript
 * sources whose relative imports carry no file extension, and the capture job runs under plain
 * Node rather than a bundler. A hundred lines of reader here costs less than a module resolution
 * hook for the whole repository, and the capture job is the only caller.
 *
 * The dialect: little endian, fixed width, no varints. A root compound is a type byte, a name,
 * then the payload. `packages/prismarine/src/world/providers/leveldb/` documents what the
 * compounds mean.
 */

/** A value an NBT tag can hold, once the tag types are dropped. */
export type NbtValue = number | bigint | string | Buffer | NbtValue[] | NbtCompound;

/** An NBT compound as plain data: tag names to their values. */
export interface NbtCompound {
    [name: string]: NbtValue;
}

const TAG_END = 0;
const TAG_COMPOUND = 10;

/** Reads one record left to right. Every read advances the cursor past what it returned. */
export class SaveCursor {
    private at = 0;
    private readonly buffer: Buffer;

    public constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    /** Whether every byte of the record has been read. */
    public get done(): boolean {
        return this.at >= this.buffer.byteLength;
    }

    /** Bytes the record still holds. */
    public get remaining(): number {
        return this.buffer.byteLength - this.at;
    }

    /** One unsigned byte. */
    public byte(): number {
        return this.buffer.readUInt8(this.take(1));
    }

    /** One signed byte. A sub chunk's own index is one of these. */
    public signedByte(): number {
        return this.buffer.readInt8(this.take(1));
    }

    /** One unsigned 16 bit little endian value. */
    public unsignedShort(): number {
        return this.buffer.readUInt16LE(this.take(2));
    }

    /** One signed 32 bit little endian value. */
    public int(): number {
        return this.buffer.readInt32LE(this.take(4));
    }

    /**
     * One NBT compound, type byte and name included.
     *
     * @throws Error when the record does not hold a compound at the cursor.
     */
    public compound(): NbtCompound {
        const type = this.byte();
        if (type !== TAG_COMPOUND) throw new Error(`Expected an NBT compound, found tag type ${type}`);
        this.string();
        return this.compoundBody();
    }

    private take(bytes: number): number {
        const from = this.at;
        if (from + bytes > this.buffer.byteLength) {
            throw new Error(`A saved record ended after ${this.buffer.byteLength} bytes with ${bytes} more expected`);
        }
        this.at += bytes;
        return from;
    }

    private string(): string {
        const length = this.unsignedShort();
        const from = this.take(length);
        return this.buffer.toString('utf8', from, from + length);
    }

    private compoundBody(): NbtCompound {
        const compound: NbtCompound = {};
        for (;;) {
            const type = this.byte();
            if (type === TAG_END) return compound;
            compound[this.string()] = this.payload(type);
        }
    }

    private payload(type: number): NbtValue {
        switch (type) {
            case 1:
                return this.buffer.readInt8(this.take(1));
            case 2:
                return this.buffer.readInt16LE(this.take(2));
            case 3:
                return this.int();
            case 4:
                return this.buffer.readBigInt64LE(this.take(8));
            case 5:
                return this.buffer.readFloatLE(this.take(4));
            case 6:
                return this.buffer.readDoubleLE(this.take(8));
            case 7: {
                const length = this.int();
                const from = this.take(length);
                return Buffer.from(this.buffer.subarray(from, from + length));
            }
            case 8:
                return this.string();
            case 9: {
                const elementType = this.byte();
                const length = this.int();
                const list: NbtValue[] = [];
                for (let i = 0; i < length; i++) {
                    list.push(elementType === TAG_COMPOUND ? this.compoundBody() : this.payload(elementType));
                }
                return list;
            }
            case TAG_COMPOUND:
                return this.compoundBody();
            case 11:
                return Array.from({ length: this.int() }, () => this.int());
            case 12:
                return Array.from({ length: this.int() }, () => this.buffer.readBigInt64LE(this.take(8)));
            default:
                throw new Error(`A saved record holds NBT tag type ${type}, which this reader does not know`);
        }
    }
}
