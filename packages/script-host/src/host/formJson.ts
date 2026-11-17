/**
 * Writes JSON the way Bedrock Dedicated Server (BDS) writes a form, so the `ModalFormRequestPacket`
 * a script's form sends carries the same bytes on JSPrismarine as on BDS. The `form-json` scenario
 * of the parity suite's `scripting.ui` family records what the pinned BDS writes:
 *
 * - an object's keys in byte order, and a newline after the document;
 * - a string with only `"`, `\`, and the characters below U+0020 escaped, the ones without a short
 *   escape as `\u` and four upper-case hexadecimal digits, and every other character as UTF-8;
 * - an integer in decimal, and a float, which forms keep as 32 bits, in a format of its own:
 *   {@link bdsFloat}.
 */

/** A number BDS writes as a float, such as a slider's bounds, rather than as an integer. */
export class BdsFloat {
    /** The value, rounded to the 32-bit float BDS keeps. */
    public readonly value: number;

    public constructor(value: number) {
        this.value = Math.fround(value);
    }
}

/** A JSON value as BDS writes it: a plain number is an integer, and a float is a {@link BdsFloat}. */
export type BdsJson = string | number | boolean | null | BdsFloat | readonly BdsJson[] | BdsJsonObject;

/** A JSON object as BDS writes it. Its keys are written in byte order, whatever order they are in. */
export interface BdsJsonObject {
    readonly [key: string]: BdsJson;
}

/**
 * C's `%#.16g`: 16 significant digits, in fixed notation when the exponent is from -4 to 15 and
 * in exponential notation with at least two exponent digits otherwise, keeping trailing zeros.
 */
const sixteenDigits = (value: number): string => {
    if (value === 0) return `${Object.is(value, -0) ? '-' : ''}0.000000000000000`;
    const [mantissa = '', exponentText = '0'] = value.toExponential(15).split('e');
    const exponent = Number(exponentText);
    if (exponent < -4 || exponent >= 16) {
        return `${mantissa}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
    }
    return value.toFixed(15 - exponent);
};

/**
 * Writes a float as BDS's JSON writer does: C's `%#.16g`, then the trailing zeros of a fixed
 * notation cut down to one, so 0.5 is `0.50`, 10 is `10.0` and 0.1 as a 32-bit float is
 * `0.1000000014901161`. An exponential notation keeps every digit. A value that is not finite,
 * which no form can hold, is written as `null`.
 */
export const bdsFloat = (value: number): string => {
    if (!Number.isFinite(value)) return 'null';
    const text = sixteenDigits(value);
    if (!text.endsWith('0')) return text;
    let at = text.length - 1;
    while (at > 0 && text[at] === '0') at--;
    const lastNonZero = at;
    for (; at >= 0; at--) {
        const char = text[at];
        if (char === '.') return text.slice(0, lastNonZero + 2);
        if (char === undefined || char < '0' || char > '9') return text;
    }
    return text;
};

/** Escapes a string as BDS's JSON writer does, quotes included. */
const quote = (text: string): string => {
    let written = '"';
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        if (char === '"') written += '\\"';
        else if (char === '\\') written += '\\\\';
        else if (char === '\b') written += '\\b';
        else if (char === '\f') written += '\\f';
        else if (char === '\n') written += '\\n';
        else if (char === '\r') written += '\\r';
        else if (char === '\t') written += '\\t';
        else if (code < 0x20) written += `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;
        else written += char;
    }
    return `${written}"`;
};

/** Writes one value without the document's final newline. */
export const writeBdsJsonValue = (value: BdsJson): string => {
    if (value === null) return 'null';
    if (typeof value === 'string') return quote(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : bdsFloat(value);
    if (value instanceof BdsFloat) return bdsFloat(value.value);
    if (Array.isArray(value)) return `[${value.map(writeBdsJsonValue).join(',')}]`;
    // Narrowed to the object form: every other form returned above.
    const object = value as BdsJsonObject;
    const keys = Object.keys(object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((key) => `${quote(key)}:${writeBdsJsonValue(object[key] ?? null)}`).join(',')}}`;
};

/** Writes a JSON document as BDS writes a form: {@link writeBdsJsonValue} and a newline. */
export const writeBdsJson = (value: BdsJson): string => `${writeBdsJsonValue(value)}\n`;
