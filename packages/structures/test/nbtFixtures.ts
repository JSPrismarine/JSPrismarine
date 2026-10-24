/**
 * Hand-built NBT for the reader tests. Encoding goes through
 * `@jsprismarine/nbt`'s writer, so a reader test compares this package's
 * parse against bytes produced by an encoder it does not own.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, Types } from '@jsprismarine/nbt';

/** Any tag value the writer accepts as a compound child or list entry. */
export type TagValue = NBTTagCompound | Set<TagValue> | number[] | Types.StringVal | Types.NumberVal | Types.ByteVal;

/** A TAG_String. */
export const str = (value: string): Types.StringVal => new Types.StringVal(value);

/** A TAG_Int. */
export const int = (value: number): Types.NumberVal => new Types.NumberVal(value);

/** A TAG_Byte. */
export const byte = (value: number): Types.ByteVal => new Types.ByteVal(value);

/** A TAG_Double. */
export const dbl = (value: number): Types.DoubleVal => new Types.DoubleVal(value);

/** A TAG_List, which the reader and writer both represent as an insertion-ordered set. */
export const list = (...values: TagValue[]): Set<TagValue> => new Set(values);

/** A TAG_List of three TAG_Ints, the shape both formats use for sizes and positions. */
export const intTriple = (x: number, y: number, z: number): Set<TagValue> => list(int(x), int(y), int(z));

/** A TAG_List of three TAG_Doubles, the shape both formats use for entity positions. */
export const doubleTriple = (x: number, y: number, z: number): Set<TagValue> =>
    new Set([dbl(x), dbl(y), dbl(z)] as unknown as TagValue[]);

/** A TAG_Compound with the given children, naming nested compounds after their key. */
export const compound = (children: Record<string, TagValue>, name = ''): NBTTagCompound => {
    const tag = new NBTTagCompound(name);
    for (const [key, value] of Object.entries(children)) {
        if (value instanceof NBTTagCompound) value.setName(key);
        tag.addValue(key, value);
    }
    return tag;
};

/** Encodes a compound as uncompressed big-endian NBT, the Java template byte order. */
export const encodeBigEndian = (root: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    root.writeToStream(stream, ByteOrder.BIG_ENDIAN);
    return stream.getBuffer();
};

/** Encodes a compound as uncompressed little-endian NBT, the `.mcstructure` byte order. */
export const encodeLittleEndian = (root: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    root.writeToStream(stream, ByteOrder.LITTLE_ENDIAN);
    return stream.getBuffer();
};
