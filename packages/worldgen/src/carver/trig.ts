import { readsSince } from '../dataPackFormat';
import { f32 } from '../math';

const SIN_QUANTIZATION = 65536;
const SIN_SCALE = 10430.378350470453;
const COS_OFFSET = 16384;

/**
 * 26.4 (format 128) changed `Mth.sin` and `Mth.cos`. They round to the nearest table entry where
 * 26.3 truncated, read a negative angle as the mirror of its positive one, and the table holds
 * exactly 0, 1, 0 and -1 at the four quarter turns.
 */
export const SINCE_ROUNDED_MTH_TRIG = 128;

/** Java's `Mth.sin` and `Mth.cos` for one release. */
export interface MthTrig {
    /** Java's `Mth.sin`: a table lookup, not `Math.sin`. */
    readonly sin: (angle: number) => number;
    /** Java's `Mth.cos`: the same table read a quarter turn along. */
    readonly cos: (angle: number) => number;
}

/**
 * Java's `Mth.SIN`, a 65536-entry single-precision sine table, built on first use because most
 * callers of this package never carve or decorate.
 *
 * Carver paths read it tens of thousands of times per chunk and its values differ from
 * `Math.sin` in the last few bits, which is enough to move a tunnel by a block over a hundred
 * steps.
 */
const lazyTable = (exactQuarterTurns: boolean): (() => Float32Array) => {
    let table: Float32Array | undefined;
    return () => {
        if (!table) {
            table = new Float32Array(SIN_QUANTIZATION);
            for (let index = 0; index < SIN_QUANTIZATION; index++) table[index] = Math.sin(index / SIN_SCALE);
            if (exactQuarterTurns) {
                table[0] = 0;
                table[COS_OFFSET] = 1;
                table[COS_OFFSET * 2] = 0;
                table[COS_OFFSET * 3] = -1;
            }
        }
        return table;
    };
};

/** Reduces a table index the way Java's `(long) value & 65535L` does, for any magnitude. */
const tableIndex = (value: number): number => {
    const truncated = Math.trunc(value);
    return ((truncated % SIN_QUANTIZATION) + SIN_QUANTIZATION) % SIN_QUANTIZATION;
};

const truncatingTable = lazyTable(false);
const roundingTable = lazyTable(true);

/** 26.3's `Mth.sin` and `Mth.cos`, which truncate the scaled angle. */
export const TRUNCATING_MTH_TRIG: MthTrig = {
    sin: (angle) => truncatingTable()[tableIndex(angle * SIN_SCALE)] as number,
    cos: (angle) => truncatingTable()[tableIndex(angle * SIN_SCALE + COS_OFFSET)] as number
};

/**
 * 26.4's `Mth.sin` and `Mth.cos`, which round the scaled angle and fold a negative angle onto its
 * positive mirror: sine negates, cosine does not.
 */
export const ROUNDING_MTH_TRIG: MthTrig = {
    sin: (angle) =>
        angle >= 0
            ? (roundingTable()[tableIndex(angle * SIN_SCALE + 0.5)] as number)
            : -(roundingTable()[tableIndex(-angle * SIN_SCALE + 0.5)] as number),
    cos: (angle) => roundingTable()[tableIndex(Math.abs(angle) * SIN_SCALE + COS_OFFSET + 0.5)] as number
};

/**
 * The `Mth.sin` and `Mth.cos` of the release a target reads.
 *
 * @param format - The target's data pack format major, or undefined for the default release.
 */
export const mthTrig = (format: number | undefined): MthTrig =>
    readsSince(format, SINCE_ROUNDED_MTH_TRIG) ? ROUNDING_MTH_TRIG : TRUNCATING_MTH_TRIG;

/** The default release's `Mth.sin`, {@link TRUNCATING_MTH_TRIG}'s. */
export const mthSin = TRUNCATING_MTH_TRIG.sin;

/** The default release's `Mth.cos`, {@link TRUNCATING_MTH_TRIG}'s. */
export const mthCos = TRUNCATING_MTH_TRIG.cos;

/** Java's `Mth.randomBetween`: a single-precision draw in `[min, maxExclusive)`. */
export const randomBetween = (nextFloat: number, min: number, maxExclusive: number): number =>
    f32(f32(nextFloat * f32(maxExclusive - min)) + min);
