/** One signed Java `long` represented by its unsigned high and low 32-bit lanes. */
export interface LongLanes {
    hi: number;
    lo: number;
}

/**
 * Writes the low 64 bits of the lane-pair product into a caller-owned result. Splitting each low
 * lane into 16-bit limbs keeps every partial sum below 2^53, and the discarded high-lane product
 * is exactly the overflow Java drops from a `long` multiply.
 */
export const mulLow64 = (aHi: number, aLo: number, bHi: number, bLo: number, result: LongLanes): void => {
    const a0 = aLo & 0xffff;
    const a1 = aLo >>> 16;
    const b0 = bLo & 0xffff;
    const b1 = bLo >>> 16;
    const low = a0 * b0;
    const mid = a0 * b1 + a1 * b0;
    const lowFull = low + (mid % 65536) * 65536;
    result.lo = lowFull >>> 0;
    result.hi =
        (a1 * b1 +
            Math.floor(mid / 65536) +
            Math.floor(lowFull / 4294967296) +
            (Math.imul(aLo, bHi) >>> 0) +
            (Math.imul(aHi, bLo) >>> 0)) >>>
        0;
};
