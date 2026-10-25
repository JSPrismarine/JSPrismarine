import { f32 } from '../math';
import { MarsagliaPolarGaussian } from './MarsagliaPolarGaussian';
import type { PositionalRandomFactory, RandomSource } from './RandomSource';
import type { Seed128bit } from './randomSupport';
import {
    asLong,
    GOLDEN_RATIO_64,
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
 *
 * This is the reference implementation over `BigInt`, exact and slow. {@link
 * XoroshiroRandomSource} runs the same recurrence over 32-bit lanes for speed, and the random
 * test suite holds the two to bit equality over millions of draws.
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

/*
 * 64-bit lane arithmetic: a Java `long` as two unsigned 32-bit halves held in doubles. Every
 * intermediate value stays an exact integer below 2^53, so the results equal the BigInt forms
 * bit for bit while avoiding BigInt's per-operation allocations.
 */

const laneHiOf = (value: bigint): number => Number((BigInt.asUintN(64, value) >> 32n) & 0xffffffffn);
const laneLoOf = (value: bigint): number => Number(BigInt.asUintN(64, value) & 0xffffffffn);

const GOLDEN_HI = laneHiOf(GOLDEN_RATIO_64);
const GOLDEN_LO = laneLoOf(GOLDEN_RATIO_64);
const SILVER_HI = laneHiOf(SILVER_RATIO_64);
const SILVER_LO = laneLoOf(SILVER_RATIO_64);

/* The pair-returning helpers below leave their result here; JavaScript is single-threaded. */
let tmpHi = 0;
let tmpLo = 0;

/** Leaves the low 64 bits of the product of two lane pairs in `tmpHi`/`tmpLo`. */
const mulLow64 = (aHi: number, aLo: number, bHi: number, bLo: number): void => {
    const a0 = aLo & 0xffff;
    const a1 = aLo >>> 16;
    const b0 = bLo & 0xffff;
    const b1 = bLo >>> 16;
    const low = a0 * b0;
    const mid = a0 * b1 + a1 * b0;
    const lowFull = low + (mid % 65536) * 65536;
    tmpLo = lowFull >>> 0;
    tmpHi =
        (a1 * b1 +
            Math.floor(mid / 65536) +
            Math.floor(lowFull / 4294967296) +
            (Math.imul(aLo, bHi) >>> 0) +
            (Math.imul(aHi, bLo) >>> 0)) >>>
        0;
};

/**
 * Leaves Java's `Mth.getSeed` position hash in `tmpHi`/`tmpLo`.
 *
 * This is `positionalSeed` from `randomSupport` computed over lanes; the random test suite
 * holds the two to equality. The `x * 3129871` term overflows as a 32-bit `int` before it
 * widens, which is why it goes through `Math.imul`.
 */
const positionalSeedLanes = (x: number, y: number, z: number): void => {
    const xTerm = Math.imul(x | 0, 3129871);
    const zInt = z | 0;
    mulLow64((zInt >> 31) >>> 0, zInt >>> 0, 0, 116129781);
    const yInt = y | 0;
    const hi = ((xTerm >> 31) ^ tmpHi ^ (yInt >> 31)) >>> 0;
    const lo = (xTerm ^ tmpLo ^ yInt) >>> 0;
    // seed = seed * seed * 42317861 + seed * 11
    mulLow64(hi, lo, hi, lo);
    mulLow64(tmpHi, tmpLo, 0, 42317861);
    const productHi = tmpHi;
    const productLo = tmpLo;
    mulLow64(hi, lo, 0, 11);
    const sumLo = productLo + tmpLo;
    const sumHi = productHi + tmpHi + (sumLo > 0xffffffff ? 1 : 0);
    // seed >> 16, an arithmetic shift
    const high = sumHi >>> 0;
    tmpHi = ((high | 0) >> 16) >>> 0;
    tmpLo = (((sumLo >>> 0) >>> 16) | (high << 16)) >>> 0;
};

/**
 * A {@link RandomSource} running Xoroshiro128++ over 32-bit lanes.
 *
 * Bit-for-bit equal to {@link Xoroshiro128PlusPlus}, which stays the slow reference this is
 * tested against; the lanes avoid a BigInt allocation per operation, which matters because the
 * aquifer and the ore vein rule build one of these per visited cell.
 */
export class XoroshiroRandomSource implements RandomSource {
    private loHi: number;
    private loLo: number;
    private hiHi: number;
    private hiLo: number;
    private outHi = 0;
    private outLo = 0;
    private gaussianSource: MarsagliaPolarGaussian | undefined;

    /** Builds a source from a 128-bit state, which `fork` and the positional factory produce. */
    public static fromState(state: Seed128bit): XoroshiroRandomSource {
        return new XoroshiroRandomSource(state.seedLo, state.seedHi);
    }

    /** Builds a source from a world seed, spreading it to 128 bits the way Java does. */
    public static fromSeed(seed: bigint): XoroshiroRandomSource {
        return XoroshiroRandomSource.fromState(upgradeSeedTo128bit(seed));
    }

    /** Builds a source from a 128-bit state given as four unsigned 32-bit lanes. */
    public static fromLanes(loHi: number, loLo: number, hiHi: number, hiLo: number): XoroshiroRandomSource {
        const source = new XoroshiroRandomSource(0n, 0n);
        if ((loHi | loLo | hiHi | hiLo) === 0) return source;
        source.loHi = loHi >>> 0;
        source.loLo = loLo >>> 0;
        source.hiHi = hiHi >>> 0;
        source.hiLo = hiLo >>> 0;
        return source;
    }

    public constructor(seedLo: bigint, seedHi: bigint) {
        // An all-zero state is a fixed point of the recurrence, so Java substitutes a constant.
        if ((asLong(seedLo) | asLong(seedHi)) === 0n) {
            this.loHi = GOLDEN_HI;
            this.loLo = GOLDEN_LO;
            this.hiHi = SILVER_HI;
            this.hiLo = SILVER_LO;
        } else {
            this.loHi = laneHiOf(seedLo);
            this.loLo = laneLoOf(seedLo);
            this.hiHi = laneHiOf(seedHi);
            this.hiLo = laneLoOf(seedHi);
        }
    }

    /** @inheritDoc */
    public nextLong(): bigint {
        this.advance();
        return asLong((BigInt(this.outHi) << 32n) | BigInt(this.outLo));
    }

    /** @inheritDoc */
    public nextInt(): number {
        this.advance();
        return this.outLo | 0;
    }

    /** @inheritDoc */
    public nextIntBounded(bound: number): number {
        if (bound <= 0) throw new RangeError('Bound must be positive');

        this.advance();
        let high = this.productHigh32(this.outLo >>> 0, bound);
        if (tmpLo < bound) {
            // Lemire's rejection bound: the first multiple of `bound` at or above 2^32 mod bound.
            const threshold = ((-bound >>> 0) % bound) >>> 0;
            while (tmpLo < threshold) {
                this.advance();
                high = this.productHigh32(this.outLo >>> 0, bound);
            }
        }
        return high | 0;
    }

    /** @inheritDoc */
    public nextBoolean(): boolean {
        this.advance();
        return (this.outLo & 1) !== 0;
    }

    /** @inheritDoc */
    public nextFloat(): number {
        this.advance();
        return f32(f32(this.outHi >>> 8) * FLOAT_UNIT);
    }

    /** @inheritDoc */
    public nextDouble(): number {
        this.advance();
        return (this.outHi * 2097152 + (this.outLo >>> 11)) * DOUBLE_UNIT;
    }

    /** @inheritDoc */
    public nextGaussian(): number {
        this.gaussianSource ??= new MarsagliaPolarGaussian(this);
        return this.gaussianSource.nextGaussian();
    }

    /** @inheritDoc */
    public consumeCount(rounds: number): void {
        for (let i = 0; i < rounds; i++) this.advance();
    }

    /** @inheritDoc */
    public fork(): RandomSource {
        return new XoroshiroRandomSource(this.nextLong(), this.nextLong());
    }

    /** @inheritDoc */
    public forkPositional(): PositionalRandomFactory {
        return new XoroshiroPositionalRandomFactory(this.nextLong(), this.nextLong());
    }

    /** Advances the state and leaves the next 64-bit output in `outHi`/`outLo`. */
    private advance(): void {
        const s0h = this.loHi;
        const s0l = this.loLo;
        let s1h = this.hiHi;
        let s1l = this.hiLo;
        // result = rotl(s0 + s1, 17) + s0
        const sumFull = s0l + s1l;
        const sumLo = sumFull >>> 0;
        const sumHi = (s0h + s1h + (sumFull > 0xffffffff ? 1 : 0)) >>> 0;
        const rotHi = ((sumHi << 17) | (sumLo >>> 15)) >>> 0;
        const rotLo = ((sumLo << 17) | (sumHi >>> 15)) >>> 0;
        const resultFull = rotLo + s0l;
        this.outLo = resultFull >>> 0;
        this.outHi = (rotHi + s0h + (resultFull > 0xffffffff ? 1 : 0)) >>> 0;
        // s1 ^= s0; s0 = rotl(s0, 49) ^ s1 ^ (s1 << 21); s1 = rotl(s1, 28)
        s1h = (s1h ^ s0h) >>> 0;
        s1l = (s1l ^ s0l) >>> 0;
        this.loHi = (((s0l << 17) | (s0h >>> 15)) ^ s1h ^ ((s1h << 21) | (s1l >>> 11))) >>> 0;
        this.loLo = (((s0h << 17) | (s0l >>> 15)) ^ s1l ^ (s1l << 21)) >>> 0;
        this.hiHi = ((s1h << 28) | (s1l >>> 4)) >>> 0;
        this.hiLo = ((s1l << 28) | (s1h >>> 4)) >>> 0;
    }

    /**
     * The high 32 bits of `value * bound`, leaving the low 32 bits in `tmpLo` for the Lemire
     * rejection check. Both inputs are unsigned 32-bit, so every term stays exact.
     */
    private productHigh32(value: number, bound: number): number {
        const upper = (value >>> 16) * bound;
        const lowFull = (upper % 65536) * 65536 + (value & 0xffff) * bound;
        tmpLo = lowFull >>> 0;
        return Math.floor(upper / 65536) + Math.floor(lowFull / 4294967296);
    }
}

/** The positional factory Xoroshiro-seeded worlds use for noise instances and feature placement. */
export class XoroshiroPositionalRandomFactory implements PositionalRandomFactory {
    private readonly loHi: number;
    private readonly loLo: number;
    private readonly hiHi: number;
    private readonly hiLo: number;

    public constructor(
        private readonly seedLo: bigint,
        private readonly seedHi: bigint
    ) {
        this.loHi = laneHiOf(seedLo);
        this.loLo = laneLoOf(seedLo);
        this.hiHi = laneHiOf(seedHi);
        this.hiLo = laneLoOf(seedHi);
    }

    /** @inheritDoc */
    public at(x: number, y: number, z: number): RandomSource {
        positionalSeedLanes(x, y, z);
        return XoroshiroRandomSource.fromLanes(tmpHi ^ this.loHi, tmpLo ^ this.loLo, this.hiHi, this.hiLo);
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
