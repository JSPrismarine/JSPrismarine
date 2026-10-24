import type { RandomSource } from '@jsprismarine/predicates';

/**
 * A random source that can be reseeded and can draw a normal deviate. The
 * enchanting table reseeds one stream per offer slot, and `remove_binomial`
 * switches to a normal approximation on large inputs, so both operations need
 * more than the uniform draws {@link RandomSource} promises.
 */
export interface SeedableRandom extends RandomSource {
    /** Restarts the stream, discarding any cached gaussian. */
    setSeed(seed: number): void;
    /** Returns a draw from the standard normal distribution. */
    nextGaussian(): number;
}

/** 2^24, the half width this implementation splits the 48 bit state into. */
const HALF = 0x1000000;
/** The two halves of 0x5DEECE66D, which Java uses both as the multiplier and as the seed scramble. */
const MULTIPLIER_HIGH = 0x5de;
const MULTIPLIER_LOW = 0xece66d;

/**
 * `java.util.Random`, which Minecraft's `LegacyRandomSource` is, reproduced
 * draw for draw.
 *
 * Java Edition's enchanting table seeds this generator from the player's
 * enchantment seed, so an offer is only reproducible against vanilla when the
 * generator is the same one. The 48 bit state lives in two 24 bit halves
 * rather than a `BigInt` because every intermediate product then stays inside
 * the 53 bits a double holds exactly.
 *
 * @param seed - Seed in Java's sense, scrambled on the way in the same way
 * `setSeed` scrambles it.
 */
export const javaRandom = (seed: number): SeedableRandom => {
    let high = 0;
    let low = 0;
    let spareGaussian: number | undefined;

    const setSeed = (value: number): void => {
        const wrapped = ((value % 0x1000000000000) + 0x1000000000000) % 0x1000000000000;
        high = (Math.floor(wrapped / HALF) ^ MULTIPLIER_HIGH) % HALF;
        low = ((wrapped % HALF) ^ MULTIPLIER_LOW) % HALF;
        spareGaussian = undefined;
    };

    /** Advances the state once and returns the top `bits` of it, as Java's `next(int)` does. */
    const next = (bits: number): number => {
        const productLow = low * MULTIPLIER_LOW + 0xb;
        const carry = Math.floor(productLow / HALF);
        const productHigh = low * MULTIPLIER_HIGH + high * MULTIPLIER_LOW + carry;
        low = productLow % HALF;
        high = productHigh % HALF;

        const shift = 48 - bits;
        if (shift >= 24) return Math.floor(high / 2 ** (shift - 24));
        return (high * 2 ** (24 - shift) + Math.floor(low / 2 ** shift)) | 0;
    };

    const nextInt = (bound: number): number => {
        if (bound <= 0) return 0;
        if ((bound & -bound) === bound) return Math.floor((bound * next(31)) / 0x80000000);

        let bits: number;
        let value: number;
        do {
            bits = next(31);
            value = bits % bound;
        } while (((bits - value + (bound - 1)) | 0) < 0);
        return value;
    };

    const nextFloat = (): number => next(24) / 0x1000000;
    const nextDouble = (): number => (next(26) * 0x8000000 + next(27)) / 0x20000000000000;

    const nextGaussian = (): number => {
        if (spareGaussian !== undefined) {
            const spare = spareGaussian;
            spareGaussian = undefined;
            return spare;
        }

        let first: number;
        let second: number;
        let square: number;
        do {
            first = 2 * nextDouble() - 1;
            second = 2 * nextDouble() - 1;
            square = first * first + second * second;
        } while (square >= 1 || square === 0);

        const multiplier = Math.sqrt((-2 * Math.log(square)) / square);
        spareGaussian = second * multiplier;
        return first * multiplier;
    };

    setSeed(seed);
    return { setSeed, nextInt, nextFloat, nextGaussian };
};

const hasGaussian = (random: RandomSource): random is RandomSource & Pick<SeedableRandom, 'nextGaussian'> =>
    'nextGaussian' in random && typeof random.nextGaussian === 'function';

/**
 * Draws a normal deviate from any random source. A source that already knows
 * how, such as {@link javaRandom}, answers directly; anything else goes
 * through the Marsaglia polar method over its uniform draws, which is
 * distributed correctly but does not reproduce Java's stream.
 */
export const gaussianFrom = (random: RandomSource): number => {
    if (hasGaussian(random)) return random.nextGaussian();

    let first: number;
    let second: number;
    let square: number;
    do {
        first = 2 * random.nextFloat() - 1;
        second = 2 * random.nextFloat() - 1;
        square = first * first + second * second;
    } while (square >= 1 || square === 0);

    return first * Math.sqrt((-2 * Math.log(square)) / square);
};
