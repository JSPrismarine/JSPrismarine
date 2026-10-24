/**
 * The random source structure placement and the processors draw from.
 *
 * Java Edition seeds structure placement with `WorldgenRandom` over its
 * legacy `java.util.Random` generator, so the same world seed puts the same
 * village in the same chunk. Everything in this package takes its randomness
 * through this interface, which is what makes an assembly reproducible in a
 * test.
 */
export interface RandomSource {
    /** A uniform integer in `[0, bound)`, or a full 32-bit signed integer when no bound is given. */
    nextInt(bound?: number): number;
    /** A uniform float in `[0, 1)` with 24 bits of precision, as Java's `nextFloat` has. */
    nextFloat(): number;
    /** A uniform double in `[0, 1)` with 53 bits of precision. */
    nextDouble(): number;
    /** A uniform 64-bit signed integer. */
    nextLong(): bigint;
    nextBoolean(): boolean;
    /** A new source seeded from this one, so a sub-task cannot disturb the parent's stream. */
    fork(): RandomSource;
}

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;
const INT_RANGE = 1n << 32n;
const INT_SIGN = 1n << 31n;

/**
 * Java's `java.util.Random` linear congruential generator, which Minecraft
 * calls `LegacyRandomSource`. Reproduced bit for bit, including the rejection
 * loop in `nextInt(bound)` and the power-of-two shortcut, so a seed produces
 * the stream Java produces.
 */
class LegacyRandomSource implements RandomSource {
    private state: bigint;

    public constructor(seed: bigint) {
        this.state = (seed ^ MULTIPLIER) & MASK;
    }

    public nextInt(bound?: number): number {
        if (bound === undefined) return this.next(32);
        if (!Number.isInteger(bound) || bound <= 0) throw new RangeError(`bound must be positive, got ${bound}`);
        if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);

        for (;;) {
            const bits = this.next(31);
            const value = bits % bound;
            // Java rejects the draws that would bias the low values; the
            // check is its overflow test written without 32-bit wraparound.
            if (bits - value + (bound - 1) <= 0x7fffffff) return value;
        }
    }

    public nextFloat(): number {
        return this.next(24) / (1 << 24);
    }

    public nextDouble(): number {
        return ((this.next(26) * 134217728 + this.next(27)) as number) * 2 ** -53;
    }

    public nextLong(): bigint {
        return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32)));
    }

    public nextBoolean(): boolean {
        return this.next(1) !== 0;
    }

    public fork(): RandomSource {
        return new LegacyRandomSource(this.nextLong());
    }

    /** The generator's `next(bits)`, returning a signed value for 32 bits as Java does. */
    private next(bits: number): number {
        this.state = (this.state * MULTIPLIER + ADDEND) & MASK;
        const value = this.state >> BigInt(48 - bits);
        return bits < 32 ? Number(value) : Number(value >= INT_SIGN ? value - INT_RANGE : value);
    }
}

/** A random source seeded the way `new java.util.Random(seed)` is. */
export const createLegacyRandom = (seed: bigint | number): RandomSource =>
    new LegacyRandomSource(BigInt.asIntN(64, BigInt(seed)));

/**
 * The seed Java's `WorldgenRandom.setLargeFeatureWithSalt` derives for a
 * structure region, which is what decides whether a region holds a structure
 * and where in it.
 *
 * @param x - The region's x index, which is the chunk x divided by the spacing.
 * @param z - The region's z index.
 * @param salt - The structure set's own salt, so two sets in one region draw differently.
 */
export const largeFeatureWithSaltSeed = (seed: bigint, x: number, z: number, salt: number): bigint =>
    BigInt.asIntN(64, BigInt(x) * 341873128712n + BigInt(z) * 132897987541n + seed + BigInt(salt));

/**
 * The seed Java's `WorldgenRandom.setLargeFeatureSeed` derives, used by the
 * legacy frequency reduction methods. Unlike the salted form it mixes two
 * draws of the world seed into the region coordinates.
 */
export const largeFeatureSeed = (seed: bigint, x: number, z: number): bigint => {
    const random = createLegacyRandom(seed);
    const first = random.nextLong();
    const second = random.nextLong();
    return BigInt.asIntN(64, (BigInt(x) * first) ^ (BigInt(z) * second) ^ seed);
};
