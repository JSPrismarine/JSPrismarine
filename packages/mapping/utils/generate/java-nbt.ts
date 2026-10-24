/**
 * A minimal reader for gzipped big-endian Java Edition NBT, enough to decode
 * `blocks.nbt` from GeyserMC/mappings: one root compound holding a list of
 * compounds whose values are bytes, shorts, ints and strings.
 *
 * The workspace `@jsprismarine/nbt` package reads Bedrock's NBT flavors and
 * guards against hostile input with allocation limits sized for packets, so a
 * 3.5 MB table of 35723 compounds is outside its design; this reader is the
 * forty lines the generator actually needs.
 */
import { gunzipSync } from 'node:zlib';

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

export type JavaNbtValue = number | string | JavaNbtValue[] | JavaNbtCompound;
export interface JavaNbtCompound {
    [key: string]: JavaNbtValue;
}

class Reader {
    private position = 0;
    private readonly data: Buffer;

    public constructor(data: Buffer) {
        this.data = data;
    }

    private byte(): number {
        const value = this.data.readInt8(this.position);
        this.position += 1;
        return value;
    }

    private string(): string {
        const length = this.data.readUInt16BE(this.position);
        this.position += 2;
        const value = this.data.toString('utf8', this.position, this.position + length);
        this.position += length;
        return value;
    }

    private payload(tag: number): JavaNbtValue {
        switch (tag) {
            case TAG_BYTE:
                return this.byte();
            case TAG_SHORT: {
                const value = this.data.readInt16BE(this.position);
                this.position += 2;
                return value;
            }
            case TAG_INT: {
                const value = this.data.readInt32BE(this.position);
                this.position += 4;
                return value;
            }
            case TAG_STRING:
                return this.string();
            case TAG_LIST: {
                const elementTag = this.byte();
                const length = this.data.readInt32BE(this.position);
                this.position += 4;
                const values: JavaNbtValue[] = [];
                for (let index = 0; index < length; index++) values.push(this.payload(elementTag));
                return values;
            }
            case TAG_COMPOUND: {
                const compound: JavaNbtCompound = {};
                for (let tagId = this.byte(); tagId !== TAG_END; tagId = this.byte()) {
                    const name = this.string();
                    compound[name] = this.payload(tagId);
                }
                return compound;
            }
            default:
                throw new Error(`Unsupported NBT tag ${tag} at offset ${this.position}`);
        }
    }

    public root(): JavaNbtCompound {
        const tag = this.byte();
        if (tag !== TAG_COMPOUND) throw new Error(`Expected a compound root, found tag ${tag}`);
        this.string();
        const value = this.payload(TAG_COMPOUND);
        // The root tag was just read as TAG_COMPOUND, so the payload is a compound.
        return value as JavaNbtCompound;
    }
}

/**
 * Decompresses and parses one gzipped big-endian Java NBT file into plain
 * objects, numbers and strings.
 */
export const readGzippedJavaNbt = (compressed: Buffer): JavaNbtCompound => new Reader(gunzipSync(compressed)).root();
