/**
 * Java's `Mth` helpers whose results differ from the `Math` functions they stand for: the sine
 * table, the fast `atan2` and the `float` angle wrap. A copy of Java code that calls them has to
 * call these too, or its numbers drift from Java's in the last bits and, over a few hundred ticks,
 * further.
 */

const f = Math.fround;

/** Java's sine table: 65536 `float` samples of one turn. */
const SIN = Float32Array.from({ length: 65536 }, (_, index) => Math.sin(index / 10430.378350470453));

/**
 * Java's `(int) ((long) value & 65535L)`: the value truncated toward zero, saturating as a `long`
 * does, then its low 16 bits. A `NaN` truncates to 0.
 */
const tableIndex = (value: number): number => {
    if (Number.isNaN(value)) return 0;
    const whole = Math.trunc(value);
    if (Number.isSafeInteger(whole)) return ((whole % 65536) + 65536) % 65536;
    const long = whole >= 2 ** 63 ? 2n ** 63n - 1n : whole <= -(2 ** 63) ? -(2n ** 63n) : BigInt(whole);
    return Number(BigInt.asUintN(16, long));
};

/**
 * Java's `Mth.sin`, a table lookup rather than `Math.sin`.
 *
 * @javaSource Mth.sin
 * @javaVerified vectors
 */
export const javaSin = (radians: number): number => SIN[tableIndex(radians * 10430.378350470453)] ?? 0;

/**
 * Java's `Mth.cos`, the same table a quarter turn on.
 *
 * @javaSource Mth.cos
 * @javaVerified vectors
 */
export const javaCos = (radians: number): number => SIN[tableIndex(radians * 10430.378350470453 + 16384)] ?? 0;

/** Java's `float` constant `(float) (Math.PI / 180.0)`. */
export const DEGREES_TO_RADIANS = f(Math.PI / 180);

const bits = new DataView(new ArrayBuffer(8));

const doubleBits = (value: number): bigint => {
    bits.setFloat64(0, value);
    return bits.getBigInt64(0);
};

const bitsDouble = (value: bigint): number => {
    bits.setBigInt64(0, value);
    return bits.getFloat64(0);
};

/**
 * Java's `Mth.fastInvSqrt`: one Newton step from a bit-shifted guess.
 *
 * @javaSource Mth.fastInvSqrt
 * @javaVerified vectors
 */
const fastInvSqrt = (x: number): number => {
    const half = 0.5 * x;
    const guess = bitsDouble(BigInt.asIntN(64, 6910469410427058090n - (doubleBits(x) >> 1n)));
    return guess * (1.5 - half * guess * guess);
};

const FRAC_BIAS = bitsDouble(4805340802404319232n);
const ASIN_TAB = Float64Array.from({ length: 257 }, (_, index) => Math.asin(index / 256));
const COS_TAB = Float64Array.from(ASIN_TAB, (asin) => Math.cos(asin));

/**
 * Java's `Mth.atan2`, which looks the angle up in a 257-entry table and corrects it with a series
 * term, so it can differ from `Math.atan2` in the last bits.
 *
 * @javaSource Mth.atan2
 * @javaVerified vectors
 */
export const javaAtan2 = (y: number, x: number): number => {
    const squared = x * x + y * y;
    if (Number.isNaN(squared)) return Number.NaN;
    const negY = y < 0;
    if (negY) y = -y;
    const negX = x < 0;
    if (negX) x = -x;
    const steep = y > x;
    if (steep) [x, y] = [y, x];
    const inverse = fastInvSqrt(squared);
    x *= inverse;
    y *= inverse;
    const biased = FRAC_BIAS + y;
    // Java's `(int) Double.doubleToRawLongBits(yp)`: the low 32 bits of the biased value.
    const index = Number(BigInt.asIntN(32, doubleBits(biased)));
    const phi = ASIN_TAB[index] ?? 0;
    const cosPhi = COS_TAB[index] ?? 0;
    const sinPhi = biased - FRAC_BIAS;
    const sd = y * cosPhi - x * sinPhi;
    const d = (6 + sd * sd) * sd * 0.16666666666666666;
    let theta = phi + d;
    if (steep) theta = Math.PI / 2 - theta;
    if (negX) theta = Math.PI - theta;
    return negY ? -theta : theta;
};

/**
 * Java's `Mth.wrapDegrees` for a `float`, in `float` arithmetic: the angle in [-180, 180).
 *
 * @javaSource Mth.wrapDegrees(F)F
 * @javaVerified vectors
 */
export const wrapDegreesFloat = (degrees: number): number => {
    let wrapped = f(f(degrees) % 360);
    if (wrapped >= 180) wrapped = f(wrapped - 360);
    if (wrapped < -180) wrapped = f(wrapped + 360);
    return wrapped;
};

/**
 * Java's `Mth.wrapDegrees` for a `double`: the angle in [-180, 180).
 *
 * @javaSource Mth.wrapDegrees(D)D
 * @javaVerified vectors
 */
export const wrapDegrees = (degrees: number): number => {
    let wrapped = degrees % 360;
    if (wrapped >= 180) wrapped -= 360;
    if (wrapped < -180) wrapped += 360;
    return wrapped;
};
