import { f32 } from '../math';
import { MarsagliaPolarGaussian } from './MarsagliaPolarGaussian';
import type { PositionalRandomFactory, RandomSource } from './RandomSource';
import { asLong, javaStringHashCode, positionalSeed } from './randomSupport';

const MULTIPLIER = 25214903917n;
const MULTIPLIER_LOW = 0xece66d;
const MULTIPLIER_HIGH = 0x5de;
const LOW_LANE_BITS = 24;
const LOW_LANE_SIZE = 2 ** LOW_LANE_BITS;
const LOW_LANE_MASK = LOW_LANE_SIZE - 1;
const LOW_LANE_MASK_BIGINT = 0xffffffn;
const FLOAT_UNIT = f32(5.9604645e-8);
const DOUBLE_UNIT = f32(1.110223e-16);

/**
 * Java Edition's `LegacyRandomSource`, the 48-bit linear congruential generator inherited from
 * `java.util.Random`.
 *
 * The nether, the end, the caves and floating islands presets still select it through
 * `legacy_random_source: true`, and structure placement uses it in every dimension.
 */
export class LegacyRandomSource implements RandomSource {
    private seedHigh: number;
    private seedLow: number;
    private readonly gaussianSource = new MarsagliaPolarGaussian(this);

    public constructor(seed: bigint) {
        const mixed = BigInt.asUintN(48, seed ^ MULTIPLIER);
        this.seedHigh = Number(mixed >> 24n);
        this.seedLow = Number(mixed & LOW_LANE_MASK_BIGINT);
    }

    /** Advances the state and returns the top `bits` bits, as Java's `next(int)` does. */
    public next(bits: number): number {
        const previousLow = this.seedLow;
        // A 24-by-24 product and the two cross products stay exact as doubles; masking retains
        // precisely the 48 bits Java's long multiplication keeps.
        const lowProduct = previousLow * MULTIPLIER_LOW + 11;
        this.seedLow = lowProduct & LOW_LANE_MASK;
        this.seedHigh =
            (this.seedHigh * MULTIPLIER_LOW + previousLow * MULTIPLIER_HIGH + Math.floor(lowProduct / LOW_LANE_SIZE)) &
            LOW_LANE_MASK;
        if (bits <= LOW_LANE_BITS) return this.seedHigh >>> (LOW_LANE_BITS - bits);

        const value = Math.floor(this.seedHigh * 2 ** (bits - LOW_LANE_BITS) + this.seedLow / 2 ** (48 - bits));
        return bits === 32 ? value | 0 : value;
    }

    /** @inheritDoc */
    public nextInt(): number {
        return this.next(32);
    }

    /** @inheritDoc */
    public nextIntBounded(bound: number): number {
        if (bound <= 0) throw new RangeError('Bound must be positive');
        if ((bound & (bound - 1)) === 0) {
            return this.next(31) >>> (31 - Math.log2(bound));
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
        const upper = this.next(26);
        const lower = this.next(27);
        // The 26+27-bit integer fits exactly in JavaScript's 53-bit significand.
        return (upper * 134217728 + lower) * DOUBLE_UNIT;
    }

    /** @inheritDoc */
    public nextGaussian(): number {
        return this.gaussianSource.nextGaussian();
    }

    /** @inheritDoc */
    public consumeCount(rounds: number): void {
        for (let i = 0; i < rounds; i++) this.next(32);
    }

    /** @inheritDoc */
    public fork(): RandomSource {
        return new LegacyRandomSource(this.nextLong());
    }

    /** @inheritDoc */
    public forkPositional(): PositionalRandomFactory {
        return new LegacyPositionalRandomFactory(this.nextLong());
    }
}

/** The positional factory legacy-seeded worlds use. */
export class LegacyPositionalRandomFactory implements PositionalRandomFactory {
    public constructor(private readonly seed: bigint) {}

    /** @inheritDoc */
    public at(x: number, y: number, z: number): RandomSource {
        return new LegacyRandomSource(asLong(positionalSeed(x, y, z) ^ this.seed));
    }

    /** @inheritDoc */
    public fromHashOf(name: string): RandomSource {
        return new LegacyRandomSource(asLong(BigInt(javaStringHashCode(name)) ^ this.seed));
    }

    /** @inheritDoc */
    public fromSeed(seed: bigint): RandomSource {
        return new LegacyRandomSource(seed);
    }
}
