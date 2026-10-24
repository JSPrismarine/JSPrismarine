import { f32 } from '../math';
import type { RandomSource } from '../random/RandomSource';

/** The 16 lattice gradients Java Edition's gradient noise uses, packed as `[x, y, z]` triples. */
export const GRADIENTS: readonly (readonly [number, number, number])[] = [
    [1, 1, 0],
    [-1, 1, 0],
    [1, -1, 0],
    [-1, -1, 0],
    [1, 0, 1],
    [-1, 0, 1],
    [1, 0, -1],
    [-1, 0, -1],
    [0, 1, 1],
    [0, -1, 1],
    [0, 1, -1],
    [0, -1, -1],
    [1, 1, 0],
    [0, -1, 1],
    [-1, 1, 0],
    [0, -1, -1]
];

const ROUND_OFF = 33554432;
// Java spells this `Math.nextDown(1.6777216E7)`; the spacing below 2^24 is 2^-29.
const HALF_ROUND_OFF = 16777216 - 2 ** -29;

/**
 * Folds a coordinate back toward the origin once it grows large enough that a `double` can no
 * longer separate neighboring lattice cells. Java calls this `GradientNoise.wrap`; without it
 * the far lands reappear.
 */
export const wrap = (value: number): number =>
    value >= -HALF_ROUND_OFF && value < HALF_ROUND_OFF
        ? value
        : value - Math.floor(value / ROUND_OFF + 0.5) * ROUND_OFF;

/** A noise function sampled in two or three dimensions, returning a single-precision value. */
export interface Noise {
    /** Samples at a 3D position. */
    get3(x: number, y: number, z: number): number;
    /** Samples at a 2D position, which Java treats as `y = 0`. */
    get2(x: number, z: number): number;
}

/**
 * The shared base of Perlin and simplex noise: a shuffled permutation table and three random
 * coordinate offsets, both drawn from the random source in the order Java draws them.
 */
export abstract class GradientNoise implements Noise {
    /** The random offset applied to the x coordinate before lookup. */
    public readonly offsetX: number;
    /** The random offset applied to the y coordinate before lookup. */
    public readonly offsetY: number;
    /** The random offset applied to the z coordinate before lookup. */
    public readonly offsetZ: number;
    protected readonly perms: Int8Array;

    protected constructor(random: RandomSource, noiseOffsetScale = 256) {
        this.offsetX = random.nextDouble() * noiseOffsetScale;
        this.offsetY = random.nextDouble() * noiseOffsetScale;
        this.offsetZ = random.nextDouble() * noiseOffsetScale;

        this.perms = new Int8Array(256);
        for (let i = 0; i < 256; i++) this.perms[i] = i;
        for (let i = 0; i < 256; i++) {
            const offset = random.nextIntBounded(256 - i);
            const swap = this.perms[i] ?? 0;
            this.perms[i] = this.perms[offset + i] ?? 0;
            this.perms[offset + i] = swap;
        }
    }

    /** @inheritDoc */
    public abstract get3(x: number, y: number, z: number): number;
    /** @inheritDoc */
    public abstract get2(x: number, z: number): number;

    /** Looks one byte up in the permutation table, wrapping the index to `[0, 256)`. */
    protected permute(value: number): number {
        return (this.perms[value & 0xff] ?? 0) & 0xff;
    }

    /** Dot product of a lattice gradient with a displacement, in single precision. */
    protected static gradDot(hash: number, x: number, y: number, z: number): number {
        const gradient = GRADIENTS[hash & 15] ?? GRADIENTS[0];
        if (!gradient) return 0;
        return f32(f32(f32(gradient[0] * x) + f32(gradient[1] * y)) + f32(gradient[2] * z));
    }

    /** The lattice gradient a permuted index selects. */
    protected permuteToGrad(value: number): readonly [number, number, number] {
        return GRADIENTS[this.permute(value) & 15] ?? [0, 0, 0];
    }
}
