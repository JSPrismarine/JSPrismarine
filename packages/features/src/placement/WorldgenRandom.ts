import type { PositionalRandomFactory, RandomSource } from '@jsprismarine/worldgen';
import { LegacyRandomSource, MarsagliaPolarGaussian, XoroshiroRandomSource } from '@jsprismarine/worldgen';

const asLong = (value: bigint): bigint => BigInt.asIntN(64, value);
const f32 = Math.fround;
const FLOAT_UNIT = f32(5.9604645e-8);
const DOUBLE_UNIT = 1.110223e-16;

/** Which generator backs a {@link WorldgenRandom}. The decoration pass uses Xoroshiro. */
export type WorldgenRandomAlgorithm = 'xoroshiro' | 'legacy';

/**
 * Java Edition's `WorldgenRandom`: a reseedable stream, plus the four seed derivations world
 * generation keys off.
 *
 * It is not simply one of `@jsprismarine/worldgen`'s two sources. Java's class extends
 * `LegacyRandomSource` and overrides only `next(bits)`, so every derived draw -- `nextInt`,
 * `nextFloat`, `nextDouble`, `nextGaussian` -- uses `java.util.Random`'s *formulas* over a
 * *Xoroshiro* bit stream. Handing a feature a plain `XoroshiroRandomSource` produces different
 * numbers from the first float onward, which is why this class exists rather than a helper.
 *
 * The seed derivations matter more than they look. Every feature placed in a chunk draws from a
 * stream seeded by the chunk's population seed, the feature's index in the flattened per-step
 * list and its decoration step. That is what makes a world reproducible: two servers that agree on
 * the seed, the chunk and the feature list place the same blocks, in any order, on any number of
 * threads.
 */
export class WorldgenRandom implements RandomSource {
    private readonly algorithm: WorldgenRandomAlgorithm;
    private delegate: RandomSource;
    // Java's WorldgenRandom overrides `setSeed` without resetting the gaussian cache it inherits,
    // so a reseed can still hand out a value drawn before it. Reproduced rather than fixed.
    private readonly gaussianSource = new MarsagliaPolarGaussian(this);

    /**
     * @param seed - The initial seed. The chunk generator's value is discarded by the first
     *   {@link setDecorationSeed}, so it only matters for a stream used directly.
     * @param algorithm - The backing generator. Defaults to Xoroshiro, which is what
     *   `ChunkGenerator.applyBiomeDecoration` builds.
     */
    public constructor(seed: bigint = 0n, algorithm: WorldgenRandomAlgorithm = 'xoroshiro') {
        this.algorithm = algorithm;
        this.delegate = this.create(seed);
    }

    private create(seed: bigint): RandomSource {
        return this.algorithm === 'legacy' ? new LegacyRandomSource(seed) : XoroshiroRandomSource.fromSeed(seed);
    }

    /** Restarts the stream from a seed, as Java's `setSeed` does. */
    public setSeed(seed: bigint): void {
        this.delegate = this.create(asLong(seed));
    }

    /**
     * Derives and applies a chunk's population seed, then returns it.
     *
     * @param levelSeed - The world seed.
     * @param minBlockX - The x of the chunk's lowest-numbered block, not its chunk coordinate.
     * @param minBlockZ - The z of the chunk's lowest-numbered block.
     */
    public setDecorationSeed(levelSeed: bigint, minBlockX: number, minBlockZ: number): bigint {
        this.setSeed(levelSeed);
        const xScale = asLong(this.nextLong() | 1n);
        const zScale = asLong(this.nextLong() | 1n);
        const populationSeed = asLong(asLong(BigInt(minBlockX) * xScale + BigInt(minBlockZ) * zScale) ^ levelSeed);
        this.setSeed(populationSeed);
        return populationSeed;
    }

    /**
     * Applies the stream one placed feature draws from.
     *
     * @param populationSeed - The value {@link setDecorationSeed} returned.
     * @param index - The feature's index within the flattened per-step feature list.
     * @param step - The decoration step's ordinal, 0 through 10.
     */
    public setFeatureSeed(populationSeed: bigint, index: number, step: number): void {
        this.setSeed(asLong(populationSeed + BigInt(index) + BigInt(10000 * step)));
    }

    /** Applies the stream a structure start draws from, keyed by chunk. */
    public setLargeFeatureSeed(baseSeed: bigint, chunkX: number, chunkZ: number): void {
        this.setSeed(baseSeed);
        const xScale = this.nextLong();
        const zScale = this.nextLong();
        this.setSeed(asLong(asLong(BigInt(chunkX) * xScale) ^ asLong(BigInt(chunkZ) * zScale) ^ baseSeed));
    }

    /** Applies the salted stream the region-based structure placements draw from. */
    public setLargeFeatureWithSalt(levelSeed: bigint, regionX: number, regionZ: number, salt: number): void {
        this.setSeed(
            asLong(BigInt(regionX) * 341873128712n + BigInt(regionZ) * 132897987541n + levelSeed + BigInt(salt))
        );
    }

    /** Returns the top `bits` bits of the backing stream, as Java's `next(int)` does. */
    public next(bits: number): number {
        if (this.delegate instanceof LegacyRandomSource) return this.delegate.next(bits);
        const drawn = BigInt.asUintN(64, this.delegate.nextLong());
        return Number(BigInt.asIntN(32, drawn >> BigInt(64 - bits)));
    }

    /** @inheritDoc */
    public nextInt(): number {
        return this.next(32);
    }

    /** @inheritDoc */
    public nextIntBounded(bound: number): number {
        if (bound <= 0) throw new RangeError('Bound must be positive');
        if ((bound & (bound - 1)) === 0) {
            return Number(BigInt.asIntN(32, (BigInt(bound) * BigInt(this.next(31))) >> 31n));
        }

        let sample: number;
        let modulo: number;
        do {
            sample = this.next(31);
            modulo = sample % bound;
        } while (((sample - modulo + (bound - 1)) | 0) < 0);
        return modulo;
    }

    /** @inheritDoc */
    public nextLong(): bigint {
        const upper = BigInt(this.next(32));
        const lower = BigInt(this.next(32));
        return asLong((upper << 32n) + lower);
    }

    /** @inheritDoc */
    public nextBoolean(): boolean {
        return this.next(1) !== 0;
    }

    /** @inheritDoc */
    public nextFloat(): number {
        return f32(this.next(24) * FLOAT_UNIT);
    }

    /** @inheritDoc */
    public nextDouble(): number {
        const upper = BigInt(this.next(26));
        const lower = BigInt(this.next(27));
        return Number((upper << 27n) + lower) * DOUBLE_UNIT;
    }

    /** @inheritDoc */
    public nextGaussian(): number {
        return this.gaussianSource.nextGaussian();
    }

    /** @inheritDoc */
    public consumeCount(rounds: number): void {
        for (let index = 0; index < rounds; index++) this.next(32);
    }

    /** @inheritDoc */
    public fork(): RandomSource {
        return this.delegate.fork();
    }

    /** @inheritDoc */
    public forkPositional(): PositionalRandomFactory {
        return this.delegate.forkPositional();
    }
}

/** Returns an integer in `[min, max]`, as Java's `Mth.randomBetweenInclusive` does. */
export const randomBetweenInclusive = (random: RandomSource, min: number, max: number): number =>
    random.nextIntBounded(max - min + 1) + min;

/** Returns an integer in `[min, max]`, collapsing an inverted range to `min`, as `Mth.nextInt` does. */
export const nextIntBetween = (random: RandomSource, min: number, max: number): number =>
    min >= max ? min : random.nextIntBounded(max - min + 1) + min;

/** Returns a float in `[min, max)`, as Java's `Mth.randomBetween` does. */
export const randomBetween = (random: RandomSource, min: number, max: number): number =>
    f32(f32(random.nextFloat() * f32(max - min)) + min);

/** Returns a float in `[min, max)` collapsed to `min` when inverted, as `Mth.nextFloat` does. */
export const nextFloatBetween = (random: RandomSource, min: number, max: number): number =>
    min >= max ? min : randomBetween(random, min, max);

/** Returns a double in `[min, max)`, as Java's `Mth.nextDouble` does. */
export const nextDoubleBetween = (random: RandomSource, min: number, max: number): number =>
    min >= max ? min : random.nextDouble() * (max - min) + min;

/** Returns a normally distributed float, as Java's `Mth.normal` does. */
export const normal = (random: RandomSource, mean: number, deviation: number): number =>
    f32(mean + f32(f32(random.nextGaussian()) * deviation));

/** Picks one element uniformly, as Java's `Util.getRandom(List, RandomSource)` does. */
export const randomElement = <T>(items: readonly T[], random: RandomSource): T => {
    const picked = items[random.nextIntBounded(items.length)];
    if (picked === undefined) throw new RangeError('Cannot pick from an empty list');
    return picked;
};

/** An entry in a Java `WeightedList`. */
export interface Weighted<T> {
    readonly value: T;
    readonly weight: number;
}

/**
 * Draws one entry by weight, as Java's `WeightedList.getRandomOrThrow` does.
 *
 * Java draws `nextInt(totalWeight)` and walks the list subtracting weights, so the draw count and
 * the tie-breaking order both depend on the declared order of the entries.
 */
export const randomWeighted = <T>(entries: readonly Weighted<T>[], random: RandomSource): T => {
    let total = 0;
    for (const entry of entries) total += entry.weight;
    if (total <= 0) throw new RangeError('Weighted list has no elements');

    let selection = random.nextIntBounded(total);
    for (const entry of entries) {
        selection -= entry.weight;
        if (selection < 0) return entry.value;
    }
    throw new RangeError('Weighted list selection fell past the end');
};
