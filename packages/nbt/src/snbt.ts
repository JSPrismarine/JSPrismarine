/**
 * Stringified NBT (SNBT): the text form commands write NBT in, read into typed tags and
 * printed back out.
 *
 * The grammar is Java Edition's as of 1.21.5, which is what `/data`, `/function … with` and
 * every SNBT argument read:
 *
 * - Numbers take a type suffix (`b`, `s`, `i`, `l`, `f`, `d`, case-insensitive). An integer
 *   with no suffix is an int and a decimal with none is a double. Integers may be written in
 *   hex (`0x1F`) or binary (`0b101`), with `_` between digits, and an integer suffix may carry
 *   a `u` or `s` signedness marker (`255ub`).
 * - `true` and `false` are the bytes `1b` and `0b`.
 * - Strings are double-quoted or single-quoted, with `\\`, the quotes, `\b`, `\f`, `\n`,
 *   `\r`, `\s`, `\t`, `\xHH`, `\uHHHH` and `\UHHHHHHHH` escapes. A bare word that is not a
 *   number or a boolean is a string.
 * - Lists may mix tag types, and `[B; …]`, `[I; …]` and `[L; …]` are the typed arrays.
 *
 * {@link formatSnbt} prints a tag the way `/data get` shows it: compound keys sorted, `, `
 * between elements and `: ` after a key, which is Java's `TextComponentTagVisitor` without
 * the colors.
 */
import { NbtErrors } from '@jsprismarine/errors/nbt';

import type { NbtTag, NbtTagOf } from './tag';
import {
    byteTag,
    compoundTag,
    doubleTag,
    entryOf,
    floatTag,
    intTag,
    listTag,
    longTag,
    shortTag,
    stringTag
} from './tag';

/** The characters a key or a string may be written with and no quotes. */
const BARE_CHARACTER = /[0-9A-Za-z_\-.+]/;

/** A key that needs no quotes when printed. */
const BARE_KEY = /^[0-9A-Za-z_\-.+]+$/;

/**
 * How deep compounds and lists may nest, as Java's `NbtAccounter` limits a read to 512. The root
 * is at depth 0, so a tag nested 513 levels down does not read.
 */
export const MAX_DEPTH = 512;

/** One pass over the text, carrying the cursor the whole parse shares. */
class Reader {
    public offset = 0;

    public constructor(
        public readonly text: string,
        public readonly nonFinite = false
    ) {}

    public fail(reason: string): never {
        throw new NbtErrors.SnbtSyntax({ position: this.offset, reason });
    }

    public peek(ahead = 0): string {
        return this.text[this.offset + ahead] ?? '';
    }

    public skipWhitespace(): void {
        while (/\s/.test(this.peek())) this.offset += 1;
    }

    public expect(character: string): void {
        this.skipWhitespace();
        if (this.peek() !== character) this.fail(`expected '${character}'`);
        this.offset += 1;
    }

    public atEnd(): boolean {
        return this.offset >= this.text.length;
    }
}

/** How {@link parseSnbt} reads. */
export interface SnbtReadOptions {
    /**
     * Read `Infinityf`, `-Infinityf`, `NaNf` and their `d` forms as the float or double that
     * {@link formatSnbt} printed them from. Java reads those words as strings, so commands leave
     * this off; a save that stores SNBT turns it on, so a stored infinity loads back as one.
     */
    readonly nonFinite?: boolean;
}

/**
 * Reads one SNBT tag.
 *
 * @param text - The whole of the text, which must hold exactly one tag and nothing after it
 *   but whitespace.
 * @param options - How to read; see {@link SnbtReadOptions}.
 * @returns The tag.
 * @throws {NbtErrors.SnbtSyntax} When the text is not one well-formed tag.
 */
export const parseSnbt = (text: string, options: SnbtReadOptions = {}): NbtTag => {
    const reader = new Reader(text, options.nonFinite);
    const tag = readTag(reader, 0);
    reader.skipWhitespace();
    if (!reader.atEnd()) reader.fail('unexpected text after the value');
    return tag;
};

/**
 * Reads an SNBT compound, which is what `/data merge` and `/data modify … merge` accept.
 *
 * @param options - How to read; see {@link SnbtReadOptions}.
 * @throws {NbtErrors.SnbtSyntax} When the text is not one compound.
 */
export const parseSnbtCompound = (text: string, options: SnbtReadOptions = {}): NbtTagOf<'compound'> => {
    const tag = parseSnbt(text, options);
    if (tag.type !== 'compound') throw new NbtErrors.SnbtSyntax({ position: 0, reason: 'expected a compound' });
    return tag;
};

/**
 * Reads the tag at the reader's cursor and leaves the cursor after it.
 *
 * Exported for the path reader in `./path`, which reads the `{…}` filters inside a path with
 * the same grammar.
 */
export const readSnbtAt = (text: string, offset: number): { readonly tag: NbtTag; readonly end: number } => {
    const reader = new Reader(text);
    reader.offset = offset;
    const tag = readTag(reader, 0);
    return { tag, end: reader.offset };
};

const readTag = (reader: Reader, depth: number): NbtTag => {
    if (depth > MAX_DEPTH) reader.fail(`nesting deeper than ${MAX_DEPTH}`);
    reader.skipWhitespace();
    const next = reader.peek();
    if (next === '{') return readCompound(reader, depth);
    if (next === '[') return readListOrArray(reader, depth);
    if (next === '"' || next === "'") return stringTag(readQuoted(reader));
    return readBare(reader);
};

const readCompound = (reader: Reader, depth: number): NbtTag => {
    reader.expect('{');
    const entries = new Map<string, NbtTag>();
    reader.skipWhitespace();
    while (reader.peek() !== '}') {
        if (reader.atEnd()) reader.fail("expected '}'");
        const key = readKey(reader);
        reader.expect(':');
        entries.set(key, readTag(reader, depth + 1));
        if (!readSeparator(reader, '}')) break;
    }
    reader.expect('}');
    return compoundTag(entries);
};

const readKey = (reader: Reader): string => {
    reader.skipWhitespace();
    const next = reader.peek();
    if (next === '"' || next === "'") return readQuoted(reader);
    const start = reader.offset;
    while (BARE_CHARACTER.test(reader.peek())) reader.offset += 1;
    if (reader.offset === start) reader.fail('expected a key');
    return reader.text.slice(start, reader.offset);
};

/**
 * Reads the `,` between two elements, or notices the closing bracket.
 * @returns Whether another element follows.
 */
const readSeparator = (reader: Reader, close: string): boolean => {
    reader.skipWhitespace();
    if (reader.peek() === ',') {
        reader.offset += 1;
        reader.skipWhitespace();
        // A trailing comma before the closing bracket is allowed, as Java's grammar allows it.
        return reader.peek() !== close;
    }
    if (reader.peek() !== close) reader.fail(`expected ',' or '${close}'`);
    return false;
};

const ARRAY_TYPES = { B: 'byte_array', I: 'int_array', L: 'long_array' } as const;

const readListOrArray = (reader: Reader, depth: number): NbtTag => {
    reader.expect('[');
    reader.skipWhitespace();
    const marker = reader.peek();
    if ((marker === 'B' || marker === 'I' || marker === 'L') && reader.peek(1) === ';') {
        reader.offset += 2;
        return readArray(reader, ARRAY_TYPES[marker]);
    }

    const elements: NbtTag[] = [];
    while (reader.peek() !== ']') {
        if (reader.atEnd()) reader.fail("expected ']'");
        elements.push(readTag(reader, depth + 1));
        if (!readSeparator(reader, ']')) break;
    }
    reader.expect(']');
    return listTag(elements);
};

const readArray = (reader: Reader, type: 'byte_array' | 'int_array' | 'long_array'): NbtTag => {
    const values: ArrayElementTag[] = [];
    reader.skipWhitespace();
    while (reader.peek() !== ']') {
        if (reader.atEnd()) reader.fail("expected ']'");
        const start = reader.offset;
        const element = readBare(reader);
        if (!fitsArray(type, element)) {
            reader.offset = start;
            reader.fail(`a ${type.replace('_', ' ')} cannot hold that value`);
        }
        values.push(element);
        if (!readSeparator(reader, ']')) break;
    }
    reader.expect(']');

    if (type === 'long_array') {
        return {
            type,
            value: BigInt64Array.from(values, (tag) => (tag.type === 'long' ? tag.value : BigInt(tag.value)))
        };
    }
    const numbers = values.map((tag) => Number(tag.value));
    return type === 'byte_array' ? { type, value: Int8Array.from(numbers) } : { type, value: Int32Array.from(numbers) };
};

/** An integer tag, which is what a typed array's elements are written as. */
type ArrayElementTag = NbtTagOf<'byte' | 'short' | 'int' | 'long'>;

/**
 * Whether an element may go in a typed array: a byte array takes bytes, an int array takes
 * bytes, shorts and ints, and a long array takes any integer. Java's grammar widens the
 * same way.
 */
const fitsArray = (type: 'byte_array' | 'int_array' | 'long_array', element: NbtTag): element is ArrayElementTag => {
    if (type === 'byte_array') return element.type === 'byte';
    if (type === 'int_array') return element.type === 'byte' || element.type === 'short' || element.type === 'int';
    return element.type === 'byte' || element.type === 'short' || element.type === 'int' || element.type === 'long';
};

const ESCAPES: Readonly<Record<string, string>> = {
    '\\': '\\',
    "'": "'",
    '"': '"',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    s: ' ',
    t: '\t'
};

const HEX_ESCAPE_LENGTHS: Readonly<Record<string, number>> = { x: 2, u: 4, U: 8 };

const readQuoted = (reader: Reader): string => {
    const quote = reader.peek();
    reader.offset += 1;
    let value = '';
    for (;;) {
        if (reader.atEnd()) reader.fail('unterminated string');
        const character = reader.peek();
        reader.offset += 1;
        if (character === quote) return value;
        if (character !== '\\') {
            value += character;
            continue;
        }

        const escape = reader.peek();
        reader.offset += 1;
        const simple = ESCAPES[escape];
        if (simple !== undefined) {
            value += simple;
            continue;
        }
        const length = HEX_ESCAPE_LENGTHS[escape];
        if (length === undefined) reader.fail(`unknown escape '\\${escape}'`);
        const digits = reader.text.slice(reader.offset, reader.offset + length);
        if (!/^[0-9A-Fa-f]+$/.test(digits) || digits.length !== length) reader.fail(`malformed '\\${escape}' escape`);
        const codePoint = Number.parseInt(digits, 16);
        if (codePoint > 0x10ffff) reader.fail('code point out of range');
        value += String.fromCodePoint(codePoint);
        reader.offset += length;
    }
};

/** An integer literal: sign, base prefix, digits with `_`, then an optional signedness and type suffix. */
const INTEGER = /^([+-]?)(0x[0-9A-Fa-f_]+|0b[01_]+|[0-9][0-9_]*)(?:([us])(?=[bsil]$))?([bsil]?)$/i;

/** A decimal literal, which is a float or a double. */
const DECIMAL = /^[+-]?(?:[0-9][0-9_]*\.?[0-9_]*|\.[0-9][0-9_]*)(?:e[+-]?[0-9][0-9_]*)?([fd]?)$/i;

/** A non-finite float or double as {@link formatSnbt} prints it, read with `nonFinite` on. */
const NON_FINITE = /^(-?Infinity|NaN)([fd])$/;

/** The integer types a suffix names, by the suffix in lower case. */
const INTEGER_TYPES: ReadonlyMap<
    string,
    { readonly type: 'byte' | 'short' | 'int' | 'long'; readonly bits: 8 | 16 | 32 | 64 }
> = new Map([
    ['b', { type: 'byte', bits: 8 }],
    ['s', { type: 'short', bits: 16 }],
    ['i', { type: 'int', bits: 32 }],
    ['', { type: 'int', bits: 32 }],
    ['l', { type: 'long', bits: 64 }]
] as const);

const readBare = (reader: Reader): NbtTag => {
    reader.skipWhitespace();
    const start = reader.offset;
    while (BARE_CHARACTER.test(reader.peek())) reader.offset += 1;
    const word = reader.text.slice(start, reader.offset);
    if (word.length === 0) reader.fail('expected a value');

    if (word === 'true') return byteTag(1);
    if (word === 'false') return byteTag(0);

    const nonFinite = reader.nonFinite ? NON_FINITE.exec(word) : null;
    if (nonFinite !== null) {
        const [, number = '', suffix = ''] = nonFinite;
        const value = Number(number);
        return suffix === 'f' ? floatTag(value) : doubleTag(value);
    }

    const integer = INTEGER.exec(word);
    if (integer !== null) return integerTag(reader, integer);

    const decimal = DECIMAL.exec(word);
    if (decimal !== null && /[0-9]/.test(word)) {
        const value = Number(word.replaceAll('_', '').replace(/[fd]$/i, ''));
        if (Number.isNaN(value)) reader.fail('malformed number');
        return decimal[1]?.toLowerCase() === 'f' ? floatTag(value) : doubleTag(value);
    }

    // Java refuses a bare word that starts like a number but is not one, rather than reading
    // `1abc` as a string, so a mistyped number is an error and not a quiet string.
    if (/^[0-9+\-.]/.test(word)) {
        reader.offset = start;
        reader.fail(`'${word}' is not a number`);
    }
    return stringTag(word);
};

const integerTag = (reader: Reader, match: RegExpExecArray): NbtTag => {
    const [word = '', sign = '', body = '', signedness = '', suffix = ''] = match;
    const digits = body.replaceAll('_', '');
    const based = /^0[xb]/i.test(digits);
    if (digits.length === 0 || (based && digits.length === 2)) reader.fail(`'${word}' is not a number`);
    // `BigInt` reads the `0x` and `0b` prefixes itself.
    const magnitude = BigInt(digits);
    const value = sign === '-' ? -magnitude : magnitude;

    const integer = INTEGER_TYPES.get(suffix.toLowerCase());
    if (integer === undefined) return reader.fail(`'${word}' has an unknown suffix`);
    const bits = BigInt(integer.bits);
    // A hex or binary literal with no signedness marker is read as unsigned and wrapped, so
    // `0xFFFFs` is `-1s`; a decimal one is signed and must fit.
    const unsigned = signedness.toLowerCase() === 'u' || (signedness === '' && based);
    const min = unsigned ? 0n : -(1n << (bits - 1n));
    const max = unsigned ? (1n << bits) - 1n : (1n << (bits - 1n)) - 1n;
    if (value < min || value > max) reader.fail(`'${word}' is out of range`);

    const wrapped = BigInt.asIntN(integer.bits, value);
    switch (integer.type) {
        case 'byte':
            return byteTag(Number(wrapped));
        case 'short':
            return shortTag(Number(wrapped));
        case 'long':
            return longTag(wrapped);
        case 'int':
            return intTag(Number(wrapped));
    }
};

/**
 * Prints a tag as SNBT, in the form `/data get` shows it.
 *
 * {@link parseSnbt} reads the output back to an equal tag. A non-finite float or double prints
 * as Java prints it, such as `Infinityd`, which reads back as that number only with the
 * `nonFinite` option on.
 */
export const formatSnbt = (tag: NbtTag): string => {
    switch (tag.type) {
        case 'byte':
            return `${tag.value}b`;
        case 'short':
            return `${tag.value}s`;
        case 'int':
            return `${tag.value}`;
        case 'long':
            return `${tag.value}L`;
        case 'float':
            return `${javaDecimal(tag.value, true)}f`;
        case 'double':
            return `${javaDecimal(tag.value, false)}d`;
        case 'string':
            return quoteString(tag.value);
        case 'byte_array':
            return `[B; ${Array.from(tag.value, (value) => `${value}B`).join(', ')}]`;
        case 'int_array':
            return `[I; ${Array.from(tag.value, String).join(', ')}]`;
        case 'long_array':
            return `[L; ${Array.from(tag.value, (value) => `${value}L`).join(', ')}]`;
        case 'list':
            return `[${tag.value.map(formatSnbt).join(', ')}]`;
        case 'compound': {
            const entries = Object.keys(tag.value)
                .sort()
                .map((key) => {
                    const entry = entryOf(tag.value, key);
                    return entry === undefined
                        ? ''
                        : `${BARE_KEY.test(key) ? key : quoteString(key)}: ${formatSnbt(entry)}`;
                });
            return `{${entries.join(', ')}}`;
        }
    }
};

/** Control characters with a named escape. Any other one below a space is printed as `\xHH`. */
const PRINTED_ESCAPES: Readonly<Record<string, string>> = {
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t'
};

/**
 * Quotes a string as Java's `StringTag.quoteAndEscape` does. The quote is `"` unless a `"`
 * comes before any `'`, in which case it is `'`, so the string needs the fewest escapes.
 */
export const quoteString = (value: string): string => {
    let quote = '';
    let body = '';
    for (const character of value) {
        if (character === '\\') {
            body += '\\\\';
            continue;
        }
        if (character === '"' || character === "'") {
            if (quote === '') quote = character === '"' ? "'" : '"';
            body += character === quote ? `\\${character}` : character;
            continue;
        }
        const named = PRINTED_ESCAPES[character];
        if (named !== undefined) {
            body += named;
            continue;
        }
        const code = character.codePointAt(0) ?? 0;
        body += code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, '0')}` : character;
    }
    const chosen = quote === '' ? '"' : quote;
    return `${chosen}${body}${chosen}`;
};

/**
 * A number as Java's `Float.toString` or `Double.toString` prints it: the shortest digits that
 * read back to the same value, plain between 10^-3 and 10^7 and in `1.0E7` notation outside
 * that range, always with a digit after the point.
 */
export const javaDecimal = (value: number, single: boolean): string => {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Number.POSITIVE_INFINITY) return 'Infinity';
    if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
    if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';

    const shortest = single ? shortestSingle(value) : value;
    // `toExponential()` with no argument gives as many digits as reading back needs.
    const [mantissa = '0', exponentText = '0'] = shortest.toExponential().split('e');
    const exponent = Number(exponentText);
    const negative = mantissa.startsWith('-');
    const digits = mantissa.replace('-', '').replace('.', '');
    const sign = negative ? '-' : '';

    const magnitude = Math.abs(shortest);
    if (magnitude >= 1e-3 && magnitude < 1e7) {
        if (exponent >= 0) {
            const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, '0');
            const fraction = digits.slice(exponent + 1) || '0';
            return `${sign}${whole}.${fraction}`;
        }
        return `${sign}0.${'0'.repeat(-exponent - 1)}${digits}`;
    }
    const fraction = digits.slice(1) || '0';
    return `${sign}${digits[0]}.${fraction}E${exponent}`;
};

/** The double with the fewest significant digits that rounds to the same single. */
const shortestSingle = (value: number): number => {
    const single = Math.fround(value);
    for (let precision = 1; precision <= 9; precision += 1) {
        const candidate = Number(single.toPrecision(precision));
        if (Math.fround(candidate) === single) return candidate;
    }
    return single;
};
