/**
 * Java's sine and cosine as 26.3's `Mth` computes them: a lookup in a 65536-entry
 * single-precision sine table, not `Math.sin`.
 *
 * The table's values differ from `Math.sin` in the last bits, which is enough to break a tie the
 * other way: a player looking exactly between two compass directions is nearer one of them in
 * Java's table and the other in double precision.
 */

const SIN_STEPS = 65536;
const STEPS_PER_RADIAN = 10430.378350470453;
const COS_OFFSET = 16384;

let table: Float32Array | undefined;

/** Java's sine table, built on first use. */
const sinTable = (): Float32Array => {
    if (table === undefined) {
        table = new Float32Array(SIN_STEPS);
        for (let index = 0; index < SIN_STEPS; index++) table[index] = Math.sin(index / STEPS_PER_RADIAN);
    }
    return table;
};

/** Reduces a scaled angle the way Java's `(int) ((long) value & 65535L)` does. */
const tableIndex = (value: number): number => ((Math.trunc(value) % SIN_STEPS) + SIN_STEPS) % SIN_STEPS;

/**
 * Java's `Mth.sin`.
 *
 * @javaSource Mth.sin
 */
export const mthSin = (radians: number): number => sinTable()[tableIndex(radians * STEPS_PER_RADIAN)] ?? 0;

/**
 * Java's `Mth.cos`, the same table read a quarter turn along.
 *
 * @javaSource Mth.cos
 */
export const mthCos = (radians: number): number => sinTable()[tableIndex(radians * STEPS_PER_RADIAN + COS_OFFSET)] ?? 0;
