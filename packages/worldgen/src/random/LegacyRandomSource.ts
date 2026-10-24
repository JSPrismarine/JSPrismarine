import { f32 } from '../math';
import { MarsagliaPolarGaussian } from './MarsagliaPolarGaussian';
import type { PositionalRandomFactory, RandomSource } from './RandomSource';
import { asLong, javaStringHashCode, positionalSeed } from './randomSupport';

const MODULUS_MASK = 281474976710655n;
const MULTIPLIER = 25214903917n;
const INCREMENT = 11n;
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
    private seed: bigint;
    private readonly gaussianSource = new MarsagliaPolarGaussian(this);

    public constructor(seed: bigint) {
        this.seed = asLong((seed ^ MULTIPLIER) & MODULUS_MASK);
    }

    /** Advances the state and returns the top `bits` bits, as Java's `next(int)` does. */
    public next(bits: number): number {
        this.seed = asLong((this.seed * MULTIPLIER + INCREMENT) & MODULUS_MASK);
        return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
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
