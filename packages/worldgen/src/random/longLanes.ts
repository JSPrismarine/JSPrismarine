/** One signed Java `long` represented by its unsigned high and low 32-bit lanes. */
export interface LongLanes {
    hi: number;
    lo: number;
}

/**
 * Writes the low 64 bits of the lane-pair product into a caller-owned result. The low lane is
 * `Math.imul`'s wrapped product. The carry out of it is the high half of the 32-bit by 32-bit
 * product, rebuilt from 16-bit limbs so every partial product and sum stays an exact integer
 * below 2^53 without a floating point remainder. The discarded high-lane product is exactly
 * the overflow Java drops from a `long` multiply.
 */
export const mulLow64 = (aHi: number, aLo: number, bHi: number, bLo: number, result: LongLanes): void => {
    const a0 = aLo & 0xffff;
    const a1 = aLo >>> 16;
    const b0 = bLo & 0xffff;
    const b1 = bLo >>> 16;
    const cross0 = a0 * b1;
    const cross1 = a1 * b0;
    const carry = ((a0 * b0) >>> 16) + (cross0 & 0xffff) + (cross1 & 0xffff);
    result.lo = Math.imul(aLo, bLo) >>> 0;
    result.hi =
        (a1 * b1 + (cross0 >>> 16) + (cross1 >>> 16) + (carry >>> 16) + Math.imul(aLo, bHi) + Math.imul(aHi, bLo)) >>>
        0;
};
