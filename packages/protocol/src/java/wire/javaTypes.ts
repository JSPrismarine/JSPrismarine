/**
 * The field types of the Java Edition wire that Bedrock's lack.
 *
 * Java writes fixed-width numbers big-endian. Its VarInt is a signed 32-bit number in LEB128
 * groups, so a negative one takes all five bytes. A string is Bedrock's, a VarInt byte length and
 * then UTF-8, with a longest length in characters that the reader enforces.
 */
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

/** `Unsigned Short`: a big-endian unsigned 16-bit integer. */
export const unsignedShort: WireType<number> = custom<number>(
    'Unsigned Short',
    (s, v) => s.writeUnsignedShort(v),
    (s) => s.readUnsignedShort()
);

/** `Long`: a big-endian signed 64-bit integer. */
export const long: WireType<bigint> = custom<bigint>(
    'Long',
    (s, v) => s.writeLong(v),
    (s) => s.readLong()
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

/**
 * `Text Component` as network NBT, for plain text: a String tag with no name, its length an
 * unsigned short of modified UTF-8 bytes. The configuration and play phases carry text this way;
 * the login phase still carries JSON.
 *
 * Only the plain string form is read and written; a compound component is not.
 */
export const textComponent: WireType<string> = custom<string>(
    'Text Component',
    (s, v) => {
        const bytes = Buffer.from(v, 'utf8');
        s.writeByte(NBT_STRING);
        s.writeUnsignedShort(bytes.byteLength);
        s.write(bytes);
    },
    (s) => {
        const tag = s.readByte();
        if (tag !== NBT_STRING) throw new ProtocolWireErrors.JavaTextComponentNotString({ tag });
        return s.read(s.readUnsignedShort()).toString('utf8');
    }
);
