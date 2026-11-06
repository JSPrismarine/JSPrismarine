/**
 * The Euclidean length of a three component vector, bit-identical to `Math.hypot(x, y, z)`.
 *
 * V8 runs `Math.hypot` through a general variadic builtin. This is the same algorithm for exactly
 * three arguments: scale by the largest magnitude, sum the squares with Kahan compensation, take
 * the root and scale back. That order is what keeps the result equal to `Math.hypot`'s in the last
 * bit, which `Math.sqrt(x * x + y * y + z * z)` does not: that one differs for about a third of
 * inputs, and a distance compared against a threshold would change digests.
 * @param x - The first component.
 * @param y - The second component.
 * @param z - The third component.
 * @returns The same number `Math.hypot(x, y, z)` returns, including for zero, infinite and NaN inputs.
 */
export const hypot3 = (x: number, y: number, z: number): number => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const az = Math.abs(z);

    // An infinite component wins over NaN, as it does in `Math.hypot`.
    if (ax === Infinity || ay === Infinity || az === Infinity) return Infinity;
    if (Number.isNaN(ax) || Number.isNaN(ay) || Number.isNaN(az)) return NaN;

    const max = Math.max(ax, ay, az);
    if (max === 0) return 0;

    let sum = 0;
    let compensation = 0;

    let n = ax / max;
    let summand = n * n - compensation;
    let preliminary = sum + summand;
    compensation = preliminary - sum - summand;
    sum = preliminary;

    n = ay / max;
    summand = n * n - compensation;
    preliminary = sum + summand;
    compensation = preliminary - sum - summand;
    sum = preliminary;

    n = az / max;
    summand = n * n - compensation;
    preliminary = sum + summand;
    sum = preliminary;

    return Math.sqrt(sum) * max;
};

export default hypot3;
