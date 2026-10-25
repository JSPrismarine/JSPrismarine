/**
 * The small NBT builder the payload writers share.
 *
 * `@jsprismarine/nbt` deduces a tag's type from the wrapper class of its
 * value, so every number has to be wrapped before it reaches the writer: a
 * light level is a byte, a friction is a float, and a block id is an int.
 * This module is the one place that wrapping happens, and the one place that
 * knows two facts about how a Bedrock Dedicated Server writes these
 * compounds.
 *
 * The first is key order. BDS writes every compound with its keys sorted, and
 * the writer here emits a compound in insertion order, so {@link nbtCompound}
 * sorts. That is what makes a generated definition comparable to a captured
 * one byte for byte rather than only field by field.
 *
 * The second is the empty list. BDS types an empty list `TAG_END`; the
 * writer types it `TAG_BYTE`. One captured block definition out of 98,
 * `minecraft:red_shrub`, has an empty list in it, and that one byte is the
 * only disagreement in the whole capture. See the README.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';

/** Everything {@link nbtCompound} accepts as a tag value. */
export type NbtValue =
    | Types.ByteVal
    | Types.ShortVal
    | Types.NumberVal
    | Types.LongVal
    | Types.FloatVal
    | Types.DoubleVal
    | Types.StringVal
    | NBTTagCompound
    | Set<NbtValue>;

/** A `TAG_Byte`, which is also how Bedrock writes a boolean. */
export const nbtByte = (value: number | boolean): Types.ByteVal =>
    new Types.ByteVal(typeof value === 'boolean' ? (value ? 1 : 0) : value);

/** A `TAG_Int`. */
export const nbtInt = (value: number): Types.NumberVal => new Types.NumberVal(value);

/** A `TAG_Float`, the type every coordinate and every physical quantity uses. */
export const nbtFloat = (value: number): Types.FloatVal => new Types.FloatVal(value);

/** A `TAG_String`. */
export const nbtString = (value: string): Types.StringVal => new Types.StringVal(value);

/**
 * A `TAG_List`. The writer takes the element type from the first entry, so
 * the caller is responsible for a list whose entries are all one type.
 */
export const nbtList = (items: Iterable<NbtValue>): Set<NbtValue> => new Set(items);

/**
 * A `TAG_Compound` with its keys sorted and its undefined entries dropped.
 *
 * Dropping undefined is what lets a translation write `{ texture: maybe }`
 * without a conditional around every optional field.
 *
 * @param entries - Tag name to value; a value of undefined writes no tag.
 * @param name - The compound's own name, which the nesting helpers fill in.
 */
export const nbtCompound = (entries: Readonly<Record<string, NbtValue | undefined>>, name = ''): NBTTagCompound => {
    const compound = new NBTTagCompound(name);
    for (const key of Object.keys(entries).sort()) {
        const value = entries[key];
        if (value === undefined) continue;
        if (value instanceof NBTTagCompound) value.setName(key);
        compound.addValue(key, value);
    }

    return compound;
};

/** Network NBT: little endian with varint lengths, which is what every packet carries. */
export const writeNetworkNbt = (compound: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(compound);

    return stream.getBuffer();
};

/** Reads back what {@link writeNetworkNbt} wrote, or what a server sent. */
export const readNetworkNbt = (buffer: Buffer): NBTTagCompound =>
    NBTTagCompound.readFromStream(new BinaryStream(buffer), ByteOrder.LITTLE_ENDIAN, true);

/** A tag as plain JavaScript, with the tag type kept as a prefix so a diff shows a type change. */
export type PlainNbt = string | number | boolean | PlainNbt[] | { [key: string]: PlainNbt };

const TYPE_NAMES = new Map<unknown, string>([
    [Types.ByteVal, 'byte'],
    [Types.ShortVal, 'short'],
    [Types.NumberVal, 'int'],
    [Types.LongVal, 'long'],
    [Types.FloatVal, 'float'],
    [Types.DoubleVal, 'double'],
    [Types.StringVal, 'string']
]);

/**
 * Turns a tag tree into plain data for comparison and for a readable failure.
 *
 * A scalar comes out as `"<type>:<value>"` rather than as a bare number,
 * because a float written where the client wants a byte is the mistake this
 * package exists to avoid and a plain `0.8` would hide it.
 */
export const nbtToPlain = (value: unknown): PlainNbt => {
    if (value instanceof NBTTagCompound) {
        const plain: Record<string, PlainNbt> = {};
        for (const [key, child] of value.entries()) plain[key] = nbtToPlain(child);
        return plain;
    }
    if (value instanceof Set) return [...value].map(nbtToPlain);

    const typeName = TYPE_NAMES.get(value?.constructor);
    if (typeName !== undefined) {
        // `getValue` is the one member every tag wrapper in `@jsprismarine/nbt`
        // shares, and the classes do not share a base type to narrow against.
        const scalar = (value as { getValue(): number | bigint | string }).getValue();
        return `${typeName}:${typeof scalar === 'bigint' ? scalar.toString() : scalar}`;
    }

    throw new TypeError(`not an NBT tag: ${String(value)}`);
};
