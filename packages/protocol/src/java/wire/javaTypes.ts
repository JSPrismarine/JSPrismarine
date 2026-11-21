/**
 * The field types of the Java Edition wire that Bedrock's lack.
 *
 * Java writes fixed-width numbers big-endian. Its VarInt is a signed 32-bit number in LEB128
 * groups, so a negative one takes all five bytes. A string is Bedrock's, a VarInt byte length and
 * then UTF-8, with a longest length in characters that the reader enforces.
 */
import type BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { WireType } from '../../wire/fieldTypes';
import { custom, string } from '../../wire/fieldTypes';

/** NBT's String tag id. */
const NBT_STRING = 8;

/** `VarInt`: a signed 32-bit integer, seven bits a byte, least significant group first. */
export const varInt: WireType<number> = custom<number>(
    'VarInt',
    (s, v) => s.writeUnsignedVarInt(v >>> 0),
    (s) => s.readUnsignedVarInt() | 0
);

/** `Optional VarInt`: zero for none, or the value plus one, as vanilla's `OPTIONAL_VAR_INT` writes it. */
export const optionalVarInt: WireType<number | null> = custom<number | null>(
    'Optional VarInt',
    (s, v) => s.writeUnsignedVarInt(v === null ? 0 : (v + 1) >>> 0),
    (s) => {
        const value = s.readUnsignedVarInt() | 0;
        return value === 0 ? null : value - 1;
    }
);

/** `Unsigned Short`: a big-endian unsigned 16-bit integer. */
export const unsignedShort: WireType<number> = custom<number>(
    'Unsigned Short',
    (s, v) => s.writeUnsignedShort(v),
    (s) => s.readUnsignedShort()
);

/** `Short`: a big-endian signed 16-bit integer. */
export const short: WireType<number> = custom<number>(
    'Short',
    (s, v) => s.writeShort(v),
    (s) => s.readShort()
);

/** `Int`: a big-endian signed 32-bit integer. */
export const int: WireType<number> = custom<number>(
    'Int',
    (s, v) => s.writeInt(v),
    (s) => s.readInt()
);

/** `Float`: a big-endian IEEE 754 single. */
export const float: WireType<number> = custom<number>(
    'Float',
    (s, v) => s.writeFloat(v),
    (s) => s.readFloat()
);

/** `Double`: a big-endian IEEE 754 double. */
export const double: WireType<number> = custom<number>(
    'Double',
    (s, v) => s.writeDouble(v),
    (s) => s.readDouble()
);

/** `Long`: a big-endian signed 64-bit integer. */
export const long: WireType<bigint> = custom<bigint>(
    'Long',
    (s, v) => s.writeLong(v),
    (s) => s.readLong()
);

/** `VarLong`: a signed 64-bit integer, seven bits a byte, least significant group first. */
export const varLong: WireType<bigint> = custom<bigint>(
    'VarLong',
    (s, v) => s.writeUnsignedVarLong(BigInt.asUintN(64, v)),
    (s) => BigInt.asIntN(64, s.readUnsignedVarLong())
);

/** A block's place in the world. */
export interface JavaBlockPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** `Position`: one long, x in the top 26 bits, then z in 26 and y in the low 12, as `BlockPos.asLong` packs it. */
export const blockPosition: WireType<JavaBlockPosition> = custom<JavaBlockPosition>(
    'Position',
    (s, { x, y, z }) =>
        s.writeLong(
            BigInt.asIntN(
                64,
                (BigInt.asUintN(26, BigInt(x)) << 38n) |
                    (BigInt.asUintN(26, BigInt(z)) << 12n) |
                    BigInt.asUintN(12, BigInt(y))
            )
        ),
    (s) => {
        const packed = s.readLong();
        return {
            x: Number(BigInt.asIntN(26, packed >> 38n)),
            y: Number(BigInt.asIntN(12, packed)),
            z: Number(BigInt.asIntN(26, packed >> 12n))
        };
    }
);

/**
 * A section's place, in sections: one long, x in the top 22 bits, then z in 22 and y in the low
 * 20, as `SectionPos.asLong` packs it.
 */
export const sectionPosition: WireType<JavaBlockPosition> = custom<JavaBlockPosition>(
    'Section Position',
    (s, { x, y, z }) =>
        s.writeLong(
            BigInt.asIntN(
                64,
                (BigInt.asUintN(22, BigInt(x)) << 42n) |
                    (BigInt.asUintN(22, BigInt(z)) << 20n) |
                    BigInt.asUintN(20, BigInt(y))
            )
        ),
    (s) => {
        const packed = s.readLong();
        return {
            x: Number(BigInt.asIntN(22, packed >> 42n)),
            y: Number(BigInt.asIntN(20, packed)),
            z: Number(BigInt.asIntN(22, packed >> 20n))
        };
    }
);

/**
 * `String (n)`: UTF-8 behind a VarInt byte length, at most `max` characters.
 *
 * Java counts the limit in UTF-16 code units, which is what a JavaScript string's length is.
 * @param max - The most characters the field allows.
 * @returns The field type.
 */
export const javaString = (max: number): WireType<string> =>
    custom<string>(
        `String (${max})`,
        (s, v) => string.write(s, v),
        (s) => {
            const value = string.read(s);
            if (value.length > max) throw new ProtocolWireErrors.JavaStringTooLong({ length: value.length, max });
            return value;
        }
    );

/**
 * A UUID's 32 hexadecimal digits in the 8-4-4-4-12 groups Java writes it in.
 * @param hex - The digits, without hyphens.
 * @returns The hyphenated UUID.
 */
export const hyphenatedUuid = (hex: string): string =>
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

/** `UUID`: sixteen bytes, most significant first, as the hyphenated lowercase string. */
export const uuid: WireType<string> = custom<string>(
    'UUID',
    (s, v) => s.write(Buffer.from(v.replaceAll('-', ''), 'hex')),
    (s) => hyphenatedUuid(s.read(16).toString('hex'))
);

/** Text a Java client shows: plain text, or a translation key with its arguments. */
export type JavaText = string | { readonly translate: string; readonly with?: readonly JavaText[] };

/** NBT's tag ids, for the text components a packet carries. */
const NBT_END = 0;
const NBT_LIST = 9;
const NBT_COMPOUND = 10;

/** NBT's string payload: an unsigned short byte length, then the bytes. */
const writeNbtString = (s: BinaryStream, value: string): void => {
    const bytes = Buffer.from(value, 'utf8');
    s.writeUnsignedShort(bytes.byteLength);
    s.write(bytes);
};

const readNbtString = (s: BinaryStream): string => s.read(s.readUnsignedShort()).toString('utf8');

/** One text component's payload, after its tag id. */
const writeTextPayload = (s: BinaryStream, text: JavaText): void => {
    if (typeof text === 'string') {
        writeNbtString(s, text);
        return;
    }
    s.writeByte(NBT_STRING);
    writeNbtString(s, 'translate');
    writeNbtString(s, text.translate);
    if (text.with !== undefined && text.with.length > 0) {
        s.writeByte(NBT_LIST);
        writeNbtString(s, 'with');
        s.writeByte(NBT_COMPOUND);
        s.writeInt(text.with.length);
        // A list holds one tag type, so each argument is a compound: plain text under `text`.
        for (const argument of text.with) {
            if (typeof argument === 'string') {
                s.writeByte(NBT_STRING);
                writeNbtString(s, 'text');
                writeNbtString(s, argument);
                s.writeByte(NBT_END);
            } else writeTextPayload(s, argument);
        }
    }
    s.writeByte(NBT_END);
};

const readTextPayload = (s: BinaryStream, tag: number): JavaText => {
    if (tag === NBT_STRING) return readNbtString(s);
    if (tag !== NBT_COMPOUND) throw new ProtocolWireErrors.JavaTextComponentNotString({ tag });
    let text: string | undefined;
    let translate: string | undefined;
    const args: JavaText[] = [];
    for (let field = s.readByte(); field !== NBT_END; field = s.readByte()) {
        const name = readNbtString(s);
        if (field === NBT_STRING && name === 'text') text = readNbtString(s);
        else if (field === NBT_STRING && name === 'translate') translate = readNbtString(s);
        else if (field === NBT_LIST && name === 'with') {
            const element = s.readByte();
            const count = s.readInt();
            for (let i = 0; i < count; i++) args.push(readTextPayload(s, element));
        } else throw new ProtocolWireErrors.JavaTextComponentNotString({ tag: field });
    }
    if (translate !== undefined) return args.length === 0 ? { translate } : { translate, with: args };
    return text ?? '';
};

/**
 * `Text Component` as network NBT: a String tag with no name for plain text, or a compound with
 * `translate` and `with` for a translation. The configuration and play phases carry text this way;
 * the login phase still carries JSON. Other component fields, such as styles, are not read.
 */
export const textComponent: WireType<JavaText> = custom<JavaText>(
    'Text Component',
    (s, v) => {
        s.writeByte(typeof v === 'string' ? NBT_STRING : NBT_COMPOUND);
        writeTextPayload(s, v);
    },
    (s) => readTextPayload(s, s.readByte())
);
