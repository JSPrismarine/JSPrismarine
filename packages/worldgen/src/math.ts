/**
 * The arithmetic helpers Java Edition's `Mth` provides to the world generator, kept at the
 * precision Java uses. Everything the density stack computes is `float` in 26.3, so these
 * round through {@link f32} after each operation; the noise coordinate math stays `double`.
 */

/**
 * Rounds a number to the nearest IEEE 754 single-precision value.
 *
 * Java's density samplers and noise samplers return `float`, and the generator rounds after
 * every arithmetic step. Applying this after each step reproduces that rounding.
 */
export const f32 = Math.fround;

/** `Math.floor` as a 32-bit integer, matching Java's `(int) Math.floor(v)`. */
export const floor = (value: number): number => Math.floor(value) | 0;

/** Floored division, matching Java's `Math.floorDiv`. */
export const floorDiv = (a: number, b: number): number => Math.floor(a / b);

/** Floored modulus, matching Java's `Math.floorMod`: the result takes the divisor's sign. */
export const floorMod = (a: number, b: number): number => a - Math.floor(a / b) * b;

/** Clamps a value into `[min, max]`. */
export const clamp = (value: number, min: number, max: number): number =>
    value < min ? min : value > max ? max : value;

/** Single-precision linear interpolation, matching Java's `Mth.lerp(float, float, float)`. */
export const lerpF = (alpha: number, from: number, to: number): number => f32(from + f32(alpha * f32(to - from)));

/** Single-precision bilinear interpolation over the four corners of a square. */
export const lerp2F = (alphaX: number, alphaY: number, x00: number, x10: number, x01: number, x11: number): number =>
    lerpF(alphaY, lerpF(alphaX, x00, x10), lerpF(alphaX, x01, x11));

/** Single-precision trilinear interpolation over the eight corners of a cell. */
export const lerp3F = (
    alphaX: number,
    alphaY: number,
    alphaZ: number,
    x000: number,
    x100: number,
    x010: number,
    x110: number,
    x001: number,
    x101: number,
    x011: number,
    x111: number
): number =>
    lerpF(alphaZ, lerp2F(alphaX, alphaY, x000, x100, x010, x110), lerp2F(alphaX, alphaY, x001, x101, x011, x111));

/** Double-precision linear interpolation. */
export const lerp = (alpha: number, from: number, to: number): number => from + alpha * (to - from);

/** The fraction of the way `value` lies between `min` and `max`, unclamped. */
export const inverseLerp = (value: number, min: number, max: number): number => (value - min) / (max - min);

/** Maps a value from one range to another without clamping, matching Java's `Mth.map`. */
export const map = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number =>
    lerp(inverseLerp(value, fromMin, fromMax), toMin, toMax);

/** Maps a value from one range to another, clamping the input fraction to `[0, 1]`. */
export const clampedMap = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number => {
    const factor = inverseLerp(value, fromMin, fromMax);
    if (factor < 0) return toMin;
    if (factor > 1) return toMax;
    return lerp(factor, toMin, toMax);
};

/** Perlin's quintic fade curve, in single precision. */
export const smoothstep = (x: number): number => f32(f32(f32(x * x) * x) * f32(f32(x * f32(f32(x * 6) - 15)) + 10));

/** Rounds a value down to the nearest multiple of `resolution`, matching Java's `Mth.quantize`. */
export const quantize = (value: number, resolution: number): number => floor(value / resolution) * resolution;

/**
 * Returns the first index in `[from, to)` for which `condition` holds, assuming the predicate is
 * monotonic. Matches Java's `Mth.binarySearch`, which cubic splines use to find their interval.
 */
export const binarySearch = (from: number, to: number, condition: (index: number) => boolean): number => {
    let start = from;
    let length = to - from;
    while (length > 0) {
        const half = Math.floor(length / 2);
        const middle = start + half;
        if (condition(middle)) {
            length = half;
        } else {
            start = middle + 1;
            length -= half + 1;
        }
    }
    return start;
};

/** Converts a block coordinate to the biome-cell (quart) coordinate that contains it. */
export const quartFromBlock = (block: number): number => block >> 2;

/** Converts a biome-cell (quart) coordinate to the block coordinate of its minimum corner. */
export const quartToBlock = (quart: number): number => quart << 2;
