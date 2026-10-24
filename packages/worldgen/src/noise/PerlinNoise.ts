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
        const x0 = this.permute(x);
        const x1 = this.permute(x + 1);
        const xy00 = this.permute(x0 + y);
        const xy01 = this.permute(x0 + y + 1);
        const xy10 = this.permute(x1 + y);
        const xy11 = this.permute(x1 + y + 1);
        const relativeX1 = f32(relativeX - 1);
        const relativeY1 = f32(relativeY - 1);
        const relativeZ1 = f32(relativeZ - 1);
        const d000 = GradientNoise.gradDot(this.permute(xy00 + z), relativeX, relativeY, relativeZ);
        const d100 = GradientNoise.gradDot(this.permute(xy10 + z), relativeX1, relativeY, relativeZ);
        const d010 = GradientNoise.gradDot(this.permute(xy01 + z), relativeX, relativeY1, relativeZ);
        const d110 = GradientNoise.gradDot(this.permute(xy11 + z), relativeX1, relativeY1, relativeZ);
        const d001 = GradientNoise.gradDot(this.permute(xy00 + z + 1), relativeX, relativeY, relativeZ1);
        const d101 = GradientNoise.gradDot(this.permute(xy10 + z + 1), relativeX1, relativeY, relativeZ1);
        const d011 = GradientNoise.gradDot(this.permute(xy01 + z + 1), relativeX, relativeY1, relativeZ1);
        const d111 = GradientNoise.gradDot(this.permute(xy11 + z + 1), relativeX1, relativeY1, relativeZ1);
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
