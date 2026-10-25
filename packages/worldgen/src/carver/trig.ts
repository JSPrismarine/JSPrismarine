import { f32 } from '../math';

const SIN_QUANTIZATION = 65536;
const SIN_SCALE = 10430.378350470453;
const COS_OFFSET = 16384;

/**
 * Java's `Mth.SIN`, a 65536-entry single-precision sine table.
 *
 * Carver paths read it tens of thousands of times per chunk and its values differ from
 * `Math.sin` in the last few bits, which is enough to move a tunnel by a block over a hundred
 * steps. It is built on first use because most callers of this package never carve.
 */
let table: Float32Array | undefined;

const sinTable = (): Float32Array => {
    if (!table) {
        const built = new Float32Array(SIN_QUANTIZATION);
        for (let index = 0; index < SIN_QUANTIZATION; index++) built[index] = Math.sin(index / SIN_SCALE);
        table = built;
    }
    return table;
};

/** Reduces a table index the way Java's `(long) value & 65535L` does, for any magnitude. */
const tableIndex = (value: number): number => {
    const truncated = Math.trunc(value);
    return ((truncated % SIN_QUANTIZATION) + SIN_QUANTIZATION) % SIN_QUANTIZATION;
};

/** Java's `Mth.sin`: a table lookup, not `Math.sin`. */
export const mthSin = (angle: number): number => sinTable()[tableIndex(angle * SIN_SCALE)] as number;

/** Java's `Mth.cos`: the same table read a quarter turn along. */
export const mthCos = (angle: number): number => sinTable()[tableIndex(angle * SIN_SCALE + COS_OFFSET)] as number;

/** Java's `Mth.randomBetween`: a single-precision draw in `[min, maxExclusive)`. */
export const randomBetween = (nextFloat: number, min: number, maxExclusive: number): number =>
    f32(f32(nextFloat * f32(maxExclusive - min)) + min);
