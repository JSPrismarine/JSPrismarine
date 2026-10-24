/**
 * A stream of pseudo-random numbers with Java Edition's `RandomSource` contract.
 *
 * Both implementations in this package draw from the same interface, so a generator written
 * against it works for a settings file with `legacy_random_source` either way.
 */
export interface RandomSource {
    /** Returns the next 32-bit signed integer, with every value equally likely. */
    nextInt(): number;
    /**
     * Returns the next integer in `[0, bound)`.
     *
     * @throws When `bound` is not positive, as Java does.
     */
    nextIntBounded(bound: number): number;
    /** Returns the next 64-bit signed integer. */
    nextLong(): bigint;
    /** Returns the next boolean, taken from one bit of the stream. */
    nextBoolean(): boolean;
    /** Returns the next value in `[0, 1)` with 24 bits of precision. */
    nextFloat(): number;
    /** Returns the next value in `[0, 1)` with 53 bits of precision. */
    nextDouble(): number;
    /** Returns the next normally distributed value with mean 0 and standard deviation 1. */
    nextGaussian(): number;
    /** Advances the stream by `rounds` draws without returning them. */
    consumeCount(rounds: number): void;
    /** Returns an independent stream seeded from this one, advancing this one. */
    fork(): RandomSource;
    /** Returns a positional factory seeded from this stream, advancing it. */
    forkPositional(): PositionalRandomFactory;
}

/**
 * Derives a {@link RandomSource} from a position, a name or a seed.
 *
 * Feature placement, aquifer cell centers and ore veins all key their randomness off a block
 * position through one of these, which is what makes those stages reproducible per position
 * rather than per call order.
 */
export interface PositionalRandomFactory {
    /** Returns the stream for one block position. */
    at(x: number, y: number, z: number): RandomSource;
    /** Returns the stream for a registry name, hashed with MD5 for Xoroshiro and `String.hashCode` for the legacy source. */
    fromHashOf(name: string): RandomSource;
    /** Returns the stream for a raw 64-bit seed. */
    fromSeed(seed: bigint): RandomSource;
}
