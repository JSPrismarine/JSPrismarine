/**
 * The vocabulary a packet's field list is written in.
 *
 * A wire type is one value's representation on the Bedrock wire: how to write it to a stream
 * and how to read it back, as one frozen pair so the two directions cannot drift. Field lists
 * (`define.ts`) compose these; nothing else in the protocol reads or writes bytes.
 *
 * Types are written against `@jsprismarine/binaryutils`'s `BinaryStream`, which both this
 * package's `NetworkBinaryStream` and prismarine's `DataPacket` extend, so one definition
 * serves every consumer of the wire format.
 *
 * The escape hatch for a body that resists flat description is {@link custom}: a hand-written
 * reader and writer travel as one named wire type a field list references, instead of as a
 * hand-written packet class. The docs' primitive names are used where they exist.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/primitives/}
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */
import type BinaryStream from '@jsprismarine/binaryutils';

/** One value's wire representation: both directions as one frozen pair. */
export interface WireType<T> {
    /** The docs' name for the representation, for provenance and layout dumps. */
    readonly wire: string;
    /** Writes `value` to the stream. */
    write(stream: BinaryStream, value: T): void;
    /** Reads one value off the stream. */
    read(stream: BinaryStream): T;
}

const type = <T>(wire: string, write: WireType<T>['write'], read: WireType<T>['read']): WireType<T> =>
    Object.freeze({ wire, write, read });

/** `byte`: one unsigned byte. */
export const uint8 = type<number>(
    'byte',
    (s, v) => s.writeByte(v),
    (s) => s.readByte()
);

/** `bool`: one byte, 0 or 1. */
export const bool = type<boolean>(
    'bool',
    (s, v) => s.writeBoolean(v),
    (s) => s.readBoolean()
);

/** `zigzag32`: a signed 32-bit varint. */
export const varint32 = type<number>(
    'zigzag32',
    (s, v) => s.writeVarInt(v),
    (s) => s.readVarInt()
);

/** `varint`: an unsigned 32-bit varint. */
export const varuint32 = type<number>(
    'varint',
    (s, v) => s.writeUnsignedVarInt(v),
    (s) => s.readUnsignedVarInt()
);

/** `zigzag64`: a signed 64-bit varint. */
export const varint64 = type<bigint>(
    'zigzag64',
    (s, v) => s.writeVarLong(v),
    (s) => s.readVarLong()
);

/** `varint64`: an unsigned 64-bit varint. */
export const varuint64 = type<bigint>(
    'varint64',
    (s, v) => s.writeUnsignedVarLong(v),
    (s) => s.readUnsignedVarLong()
);

/** `lf32`: a little-endian 32-bit float. */
export const lf32 = type<number>(
    'lf32',
    (s, v) => s.writeFloatLE(v),
    (s) => s.readFloatLE()
);

/** `li16`: a little-endian signed 16-bit integer. */
export const li16 = type<number>(
    'li16',
    (s, v) => s.writeShortLE(v),
    (s) => s.readShortLE()
);

/** `li32`: a little-endian signed 32-bit integer. */
export const li32 = type<number>(
    'li32',
    (s, v) => s.writeIntLE(v),
    (s) => s.readIntLE()
);

/** `i8`: one signed byte. */
export const int8 = type<number>(
    'i8',
    (s, v) => s.writeSignedByte(v),
    (s) => s.readSignedByte()
);

/** `string`: a varint byte length, then UTF-8 bytes. */
export const string = type<string>(
    'string',
    (s, v) => {
        const bytes = Buffer.from(v, 'utf8');
        s.writeUnsignedVarInt(bytes.byteLength);
        s.write(bytes);
    },
    (s) => s.read(s.readUnsignedVarInt()).toString('utf8')
);

/** An optional value: a presence `bool`, then the value when present. Absent is `null`. */
export const optional = <T>(of: WireType<T>): WireType<T | null> =>
    type<T | null>(
        `optional<${of.wire}>`,
        (s, v) => {
            s.writeBoolean(v !== null);
            if (v !== null) of.write(s, v);
        },
        (s) => (s.readBoolean() ? of.read(s) : null)
    );

/** A list: a `varint` count, then that many values. */
export const list = <T>(of: WireType<T>): WireType<T[]> =>
    type<T[]>(
        `list<${of.wire}>`,
        (s, v) => {
            s.writeUnsignedVarInt(v.length);
            for (const item of v) of.write(s, item);
        },
        (s) => {
            const count = s.readUnsignedVarInt();
            const items: T[] = [];
            for (let i = 0; i < count; i++) items.push(of.read(s));
            return items;
        }
    );

/**
 * A hand-written representation, named so layout dumps and the tracker can account for it.
 *
 * This is where `ItemStackRequest`-grade bodies live: one reader and writer pair per structure,
 * referenced from however many field lists carry it.
 */
export const custom = <T>(wire: string, write: WireType<T>['write'], read: WireType<T>['read']): WireType<T> =>
    type(wire, write, read);

/** `lu64`: a little-endian unsigned 64-bit integer. */
export const lu64 = type<bigint>(
    'lu64',
    (s, v) => s.writeUnsignedLongLE(v),
    (s) => s.readUnsignedLongLE()
);

/** `ByteArray`: a varint byte length, then the raw bytes. */
export const byteArray = type<Buffer>(
    'ByteArray',
    (s, v) => {
        s.writeUnsignedVarInt(v.byteLength);
        s.write(v);
    },
    (s) => s.read(s.readUnsignedVarInt())
);

/** A plain coordinate triple, for the positions the wire carries. */
export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

/** `Vec3`: three little-endian floats, x then y then z. */
export const vec3 = type<Vec3Like>(
    'Vec3',
    (s, v) => {
        s.writeFloatLE(v.x);
        s.writeFloatLE(v.y);
        s.writeFloatLE(v.z);
    },
    (s) => ({ x: s.readFloatLE(), y: s.readFloatLE(), z: s.readFloatLE() })
);

/** `BlockPos` as the signed triple: three ZigZag varints, x then y then z. */
export const blockPos = type<Vec3Like>(
    'BlockPos',
    (s, v) => {
        s.writeVarInt(v.x);
        s.writeVarInt(v.y);
        s.writeVarInt(v.z);
    },
    (s) => ({ x: s.readVarInt(), y: s.readVarInt(), z: s.readVarInt() })
);

/** `i32` (big-endian): a signed 32-bit integer, as `PlayStatus` carries its status. */
export const i32 = type<number>(
    'i32',
    (s, v) => s.writeInt(v),
    (s) => s.readInt()
);

/** `lu16`: a little-endian unsigned 16-bit integer. */
export const lu16 = type<number>(
    'lu16',
    (s, v) => s.writeUnsignedShortLE(v),
    (s) => s.readUnsignedShortLE()
);

/** A list whose count travels as `count` rather than the default `varint`. */
export const listWith = <T>(count: WireType<number>, of: WireType<T>): WireType<T[]> =>
    type<T[]>(
        `list<${of.wire}, ${count.wire}>`,
        (s, v) => {
            count.write(s, v.length);
            for (const item of v) of.write(s, item);
        },
        (s) => {
            const length = count.read(s);
            const items: T[] = [];
            for (let i = 0; i < length; i++) items.push(of.read(s));
            return items;
        }
    );

/** `lu32`: a little-endian unsigned 32-bit integer. */
export const lu32 = type<number>(
    'lu32',
    (s, v) => s.writeUnsignedIntLE(v),
    (s) => s.readUnsignedIntLE()
);

/** Two named fields as one unit, for list items like a chunk coordinate pair. */
export const pair = <A, B>(
    firstKey: string,
    first: WireType<A>,
    secondKey: string,
    second: WireType<B>
): WireType<Record<string, A | B>> =>
    type(
        `pair<${first.wire}, ${second.wire}>`,
        (s, v) => {
            first.write(s, v[firstKey] as A);
            second.write(s, v[secondKey] as B);
        },
        (s) => ({ [firstKey]: first.read(s), [secondKey]: second.read(s) })
    );
