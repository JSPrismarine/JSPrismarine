import { f32, floor, lerp3F, smoothstep } from '../math';
import type { RandomSource } from '../random/RandomSource';
import { GradientNoise, wrap } from './GradientNoise';

/**
 * One octave of improved Perlin noise, the building block every other noise kind stacks.
 *
 * Java Edition 26.3 computes the lattice dot products and the interpolation in single
 * precision and only the coordinates in double, which this reproduces step for step.
 */
export class PerlinNoise extends GradientNoise {
    /** The standard deviation of a single octave, used when normalizing a noise stack. */
    public static readonly STANDARD_DEVIATION = 0.2702247831245211;

    public constructor(random: RandomSource, noiseOffsetScale = 256) {
        super(random, noiseOffsetScale);
    }

    /** @inheritDoc */
    public get3(x: number, y: number, z: number): number {
        const wrappedX = wrap(x) + this.offsetX;
        const wrappedY = wrap(y) + this.offsetY;
        const wrappedZ = wrap(z) + this.offsetZ;
        const floorX = floor(wrappedX);
        const floorY = floor(wrappedY);
        const floorZ = floor(wrappedZ);
        const relativeX = f32(wrappedX - floorX);
        const relativeY = f32(wrappedY - floorY);
        const relativeZ = f32(wrappedZ - floorZ);
        return this.sampleAndLerp(floorX, floorY, floorZ, relativeX, relativeY, relativeZ, relativeY);
    }

    /** @inheritDoc */
    public get2(x: number, z: number): number {
        return this.get3(wrap(x), 0, wrap(z));
    }

    /**
     * Interpolates the eight lattice corners of one cell.
     *
     * @param originalRelativeY - The unfudged y fraction used for the interpolation weight.
     *   Smeared Perlin noise passes a shifted value as `relativeY` while keeping the weight on
     *   the original, which is what "smearing" means.
     */
    protected sampleAndLerp(
        x: number,
        y: number,
        z: number,
        relativeX: number,
        relativeY: number,
        relativeZ: number,
        originalRelativeY: number
    ): number {
        // The permutation lookups are spelled inline: ten method calls per octave sample add up
        // when a chunk samples tens of thousands of octaves. Indices are masked to [0, 256).
        const perms = this.perms;
        const x0 = (perms[x & 0xff] ?? 0) + y;
        const x1 = (perms[(x + 1) & 0xff] ?? 0) + y;
        const xy00 = (perms[x0 & 0xff] ?? 0) + z;
        const xy01 = (perms[(x0 + 1) & 0xff] ?? 0) + z;
        const xy10 = (perms[x1 & 0xff] ?? 0) + z;
        const xy11 = (perms[(x1 + 1) & 0xff] ?? 0) + z;
        const relativeX1 = f32(relativeX - 1);
        const relativeY1 = f32(relativeY - 1);
        const relativeZ1 = f32(relativeZ - 1);
        const d000 = GradientNoise.gradDot(perms[xy00 & 0xff] ?? 0, relativeX, relativeY, relativeZ);
        const d100 = GradientNoise.gradDot(perms[xy10 & 0xff] ?? 0, relativeX1, relativeY, relativeZ);
        const d010 = GradientNoise.gradDot(perms[xy01 & 0xff] ?? 0, relativeX, relativeY1, relativeZ);
        const d110 = GradientNoise.gradDot(perms[xy11 & 0xff] ?? 0, relativeX1, relativeY1, relativeZ);
        const d001 = GradientNoise.gradDot(perms[(xy00 + 1) & 0xff] ?? 0, relativeX, relativeY, relativeZ1);
        const d101 = GradientNoise.gradDot(perms[(xy10 + 1) & 0xff] ?? 0, relativeX1, relativeY, relativeZ1);
        const d011 = GradientNoise.gradDot(perms[(xy01 + 1) & 0xff] ?? 0, relativeX, relativeY1, relativeZ1);
        const d111 = GradientNoise.gradDot(perms[(xy11 + 1) & 0xff] ?? 0, relativeX1, relativeY1, relativeZ1);
        return lerp3F(
            smoothstep(relativeX),
            smoothstep(originalRelativeY),
            smoothstep(relativeZ),
            d000,
            d100,
            d010,
            d110,
            d001,
            d101,
            d011,
            d111
        );
    }
}
