/**
 * The argument compound of `/function <name> <arguments>` and `/function <name> with …`, read as
 * SNBT.
 *
 * `@jsprismarine/mcfunction` reads a macro's argument compound as JSON by default and takes an
 * SNBT reader through its `parseArguments` seam. This is that reader: it parses the text with
 * `@jsprismarine/nbt/snbt` and turns each entry into the text Java's `MacroFunction` substitutes
 * for it:
 *
 * - an integer without its type suffix, so `1b` substitutes as `1`;
 * - a float or a double as Java's `DecimalFormat("#")` prints it, with at most 15 fraction digits,
 *   no trailing zeros and no zero before the point, so `1.0d` substitutes as `1` and `0.5d` as `.5`;
 * - a string as its contents, with no quotes;
 * - a list, an array or a compound as its SNBT.
 */
import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { formatSnbt, parseSnbtCompound } from '@jsprismarine/nbt/snbt';
import type { NbtTag } from '@jsprismarine/nbt/tag';

/** The most fraction digits `MacroFunction` prints a float or a double with. */
const MACRO_FRACTION_DIGITS = 15;

/** A double's exact value as `mantissa * 2^exponent`, both integers. */
const exactParts = (value: number): { readonly mantissa: bigint; readonly exponent: number } => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, Math.abs(value));
    const bits = view.getBigUint64(0);
    const biased = Number(bits >> 52n);
    const fraction = bits & ((1n << 52n) - 1n);
    // A subnormal has no implicit leading 1 and the smallest exponent.
    return biased === 0
        ? { mantissa: fraction, exponent: -1074 }
        : { mantissa: fraction | (1n << 52n), exponent: biased - 1075 };
};

/**
 * `|value| * 10^15` rounded half to even on the exact binary value, which is where Java's
 * `DecimalFormat` rounds a double it cannot print in 15 fraction digits.
 */
const scaledHalfEven = (value: number): bigint => {
    const { mantissa, exponent } = exactParts(value);
    const numerator = mantissa * 10n ** BigInt(MACRO_FRACTION_DIGITS);
    if (exponent >= 0) return numerator << BigInt(exponent);
    const denominator = 1n << BigInt(-exponent);
    const quotient = numerator / denominator;
    const twice = (numerator % denominator) * 2n;
    if (twice > denominator || (twice === denominator && quotient % 2n === 1n)) return quotient + 1n;
    return quotient;
};

/**
 * A float or a double as `MacroFunction` prints it: Java's `DecimalFormat("#")` under
 * `Locale.ROOT` with at most 15 fraction digits. The digits are the shortest that read back,
 * rounded half to even past the 15th fraction digit; there is no zero before the point, so
 * `0.5` is `.5`, and a negative value that rounds to nothing is `-0`.
 */
const macroDecimal = (value: number): string => {
    if (Number.isNaN(value)) return 'NaN';
    const sign = value < 0 || Object.is(value, -0) ? '-' : '';
    if (!Number.isFinite(value)) return `${sign}∞`;
    if (value === 0) return `${sign}0`;

    const [mantissa = '0', exponentText = '0'] = Math.abs(value).toExponential().split('e');
    const digits = mantissa.replace('.', '');
    const exponent = Number(exponentText);
    let whole: string;
    let fraction: string;
    if (digits.length - 1 - exponent <= MACRO_FRACTION_DIGITS) {
        whole = exponent >= 0 ? digits.slice(0, exponent + 1).padEnd(exponent + 1, '0') : '';
        fraction = exponent >= 0 ? digits.slice(exponent + 1) : `${'0'.repeat(-exponent - 1)}${digits}`;
    } else {
        const scaled = scaledHalfEven(value)
            .toString()
            .padStart(MACRO_FRACTION_DIGITS + 1, '0');
        whole = scaled.slice(0, -MACRO_FRACTION_DIGITS).replace(/^0+/, '');
        fraction = scaled.slice(-MACRO_FRACTION_DIGITS).replace(/0+$/, '');
    }
    if (fraction === '') return `${sign}${whole === '' ? '0' : whole}`;
    return `${sign}${whole}.${fraction}`;
};

/** The text Java's `MacroFunction.stringify` substitutes for a tag. */
const macroText = (tag: NbtTag): string => {
    switch (tag.type) {
        case 'byte':
        case 'short':
        case 'int':
        case 'long':
            return String(tag.value);
        case 'float':
        case 'double':
            // Java widens a float to a double before it formats it, so `0.1f` prints its error.
            return macroDecimal(tag.value);
        case 'string':
            return tag.value;
        default:
            return formatSnbt(tag);
    }
};

/**
 * Reads a macro call's argument compound, in the shape `FunctionExecutor` takes its
 * `parseArguments` in.
 *
 * @param stored - Whether the text is a stored compound printed back, as `/function … with`
 *   passes it. Its `Infinityd` and `NaNf` then read as the numbers they were printed from; typed by
 *   a player, they are strings, as Java's reader makes them.
 * @returns Each entry's substitution text by name, or undefined when the text is not one SNBT
 *   compound.
 */
export const readMacroArguments = (text: string, stored = false): Record<string, string> | undefined => {
    try {
        const compound = parseSnbtCompound(text, { nonFinite: stored });
        return Object.fromEntries(Object.entries(compound.value).map(([key, tag]) => [key, macroText(tag)]));
    } catch (error) {
        if (isJSPrismarineError(error)) return undefined;
        throw error;
    }
};
