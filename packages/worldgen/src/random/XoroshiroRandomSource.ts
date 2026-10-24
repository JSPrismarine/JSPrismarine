import { f32 } from '../math';
import { MarsagliaPolarGaussian } from './MarsagliaPolarGaussian';
import type { PositionalRandomFactory, RandomSource } from './RandomSource';
import type { Seed128bit } from './randomSupport';
import {
    asLong,
    GOLDEN_RATIO_64,
    positionalSeed,
    seedFromHashOf,
    SILVER_RATIO_64,
    upgradeSeedTo128bit,
    xorSeed
} from './randomSupport';

const MASK_64 = 0xffffffffffffffffn;
const FLOAT_UNIT = f32(5.9604645e-8);
const DOUBLE_UNIT = f32(1.110223e-16);

const rotateLeft = (value: bigint, shift: bigint): bigint => {
    const unsigned = BigInt.asUintN(64, value);
    return asLong(((unsigned << shift) & MASK_64) | (unsigned >> (64n - shift)));
};

/**
 * The Xoroshiro128++ generator, the algorithm Java Edition selects when a noise settings file
 * says `legacy_random_source: false`. All overworld terrain since 1.18 comes from it.
 */
export class Xoroshiro128PlusPlus {
    private seedLo: bigint;
    private seedHi: bigint;

    public constructor(seedLo: bigint, seedHi: bigint) {
        // An all-zero state is a fixed point of the recurrence, so Java substitutes a constant.
        if ((asLong(seedLo) | asLong(seedHi)) === 0n) {
            this.seedLo = GOLDEN_RATIO_64;
            this.seedHi = SILVER_RATIO_64;
        } else {
            this.seedLo = asLong(seedLo);
            this.seedHi = asLong(seedHi);
        }
    }

    /** Advances the state and returns the next 64-bit output. */
    public nextLong(): bigint {
        const s0 = this.seedLo;
        let s1 = this.seedHi;
        const result = asLong(rotateLeft(asLong(s0 + s1), 17n) + s0);
        s1 = asLong(s1 ^ s0);
        this.seedLo = asLong(rotateLeft(s0, 49n) ^ s1 ^ ((s1 << 21n) & MASK_64));
        this.seedHi = rotateLeft(s1, 28n);
        return result;
    }
}

/** A {@link RandomSource} backed by {@link Xoroshiro128PlusPlus}. */
export class XoroshiroRandomSource implements RandomSource {
    private readonly generator: Xoroshiro128PlusPlus;
    private readonly gaussianSource = new MarsagliaPolarGaussian(this);

    /** Builds a source from a 128-bit state, which `fork` and the positional factory produce. */
    public static fromState(state: Seed128bit): XoroshiroRandomSource {
        return new XoroshiroRandomSource(state.seedLo, state.seedHi);
    }

    /** Builds a source from a world seed, spreading it to 128 bits the way Java does. */
    public static fromSeed(seed: bigint): XoroshiroRandomSource {
        return XoroshiroRandomSource.fromState(upgradeSeedTo128bit(seed));
    }

    public constructor(seedLo: bigint, seedHi: bigint) {
        this.generator = new Xoroshiro128PlusPlus(seedLo, seedHi);
    }

    /** @inheritDoc */
    public nextLong(): bigint {
        return this.generator.nextLong();
    }

    /** @inheritDoc */
    public nextInt(): number {
        return Number(BigInt.asIntN(32, this.generator.nextLong()));
    }

    /** @inheritDoc */
    public nextIntBounded(bound: number): number {
        if (bound <= 0) throw new RangeError('Bound must be positive');

        const boundBig = BigInt(bound);
        let product = BigInt(this.nextInt() >>> 0) * boundBig;
        let fractionalPart = product & 0xffffffffn;
        if (fractionalPart < boundBig) {
            // Lemire's rejection bound: the first multiple of `bound` at or above 2^32 mod bound.
            const threshold = BigInt((-bound >>> 0) % bound);
            while (fractionalPart < threshold) {
                product = BigInt(this.nextInt() >>> 0) * boundBig;
                fractionalPart = product & 0xffffffffn;
            }
        }
        return Number(BigInt.asIntN(32, product >> 32n));
    }

    /** @inheritDoc */
    public nextBoolean(): boolean {
        return (this.generator.nextLong() & 1n) !== 0n;
    }

    /** @inheritDoc */
    public nextFloat(): number {
        return f32(f32(Number(this.nextBits(24))) * FLOAT_UNIT);
    }

    /** @inheritDoc */
    public nextDouble(): number {
        return Number(this.nextBits(53)) * DOUBLE_UNIT;
    }

    /** @inheritDoc */
    public nextGaussian(): number {
        return this.gaussianSource.nextGaussian();
    }

    /** @inheritDoc */
    public consumeCount(rounds: number): void {
        for (let i = 0; i < rounds; i++) this.generator.nextLong();
    }

    /** @inheritDoc */
    public fork(): RandomSource {
        return new XoroshiroRandomSource(this.generator.nextLong(), this.generator.nextLong());
    }

    /** @inheritDoc */
    public forkPositional(): PositionalRandomFactory {
        return new XoroshiroPositionalRandomFactory(this.generator.nextLong(), this.generator.nextLong());
    }

    private nextBits(bits: number): bigint {
        return BigInt.asUintN(64, this.generator.nextLong()) >> BigInt(64 - bits);
    }
}

/** The positional factory Xoroshiro-seeded worlds use for noise instances and feature placement. */
export class XoroshiroPositionalRandomFactory implements PositionalRandomFactory {
    public constructor(
        private readonly seedLo: bigint,
        private readonly seedHi: bigint
    ) {}

    /** @inheritDoc */
    public at(x: number, y: number, z: number): RandomSource {
        return new XoroshiroRandomSource(asLong(positionalSeed(x, y, z) ^ this.seedLo), this.seedHi);
    }

    /** @inheritDoc */
    public fromHashOf(name: string): RandomSource {
        return XoroshiroRandomSource.fromState(xorSeed(seedFromHashOf(name), this.seedLo, this.seedHi));
    }

    /** @inheritDoc */
    public fromSeed(seed: bigint): RandomSource {
        return new XoroshiroRandomSource(asLong(seed ^ this.seedLo), asLong(seed ^ this.seedHi));
    }
}
