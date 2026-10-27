import { f32, floor, smoothstep } from '../math';
import type { RandomSource } from '../random/RandomSource';
import { GRADIENTS, GradientNoise, wrap } from './GradientNoise';

const PERLIN_GRADIENT_X = Float64Array.from(GRADIENTS, (gradient) => gradient[0]);
const PERLIN_GRADIENT_Y = Float64Array.from(GRADIENTS, (gradient) => gradient[1]);
const PERLIN_GRADIENT_Z = Float64Array.from(GRADIENTS, (gradient) => gradient[2]);

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
        const gradient000 = (perms[xy00 & 0xff] ?? 0) & 15;
        const gradient100 = (perms[xy10 & 0xff] ?? 0) & 15;
        const gradient010 = (perms[xy01 & 0xff] ?? 0) & 15;
        const gradient110 = (perms[xy11 & 0xff] ?? 0) & 15;
        const gradient001 = (perms[(xy00 + 1) & 0xff] ?? 0) & 15;
        const gradient101 = (perms[(xy10 + 1) & 0xff] ?? 0) & 15;
        const gradient011 = (perms[(xy01 + 1) & 0xff] ?? 0) & 15;
        const gradient111 = (perms[(xy11 + 1) & 0xff] ?? 0) & 15;
        const d000 = f32(
            f32((PERLIN_GRADIENT_X[gradient000] ?? 0) * relativeX + (PERLIN_GRADIENT_Y[gradient000] ?? 0) * relativeY) +
                (PERLIN_GRADIENT_Z[gradient000] ?? 0) * relativeZ
        );
        const d100 = f32(
            f32(
                (PERLIN_GRADIENT_X[gradient100] ?? 0) * relativeX1 + (PERLIN_GRADIENT_Y[gradient100] ?? 0) * relativeY
            ) +
                (PERLIN_GRADIENT_Z[gradient100] ?? 0) * relativeZ
        );
        const d010 = f32(
            f32(
                (PERLIN_GRADIENT_X[gradient010] ?? 0) * relativeX + (PERLIN_GRADIENT_Y[gradient010] ?? 0) * relativeY1
            ) +
                (PERLIN_GRADIENT_Z[gradient010] ?? 0) * relativeZ
        );
        const d110 = f32(
            f32(
                (PERLIN_GRADIENT_X[gradient110] ?? 0) * relativeX1 + (PERLIN_GRADIENT_Y[gradient110] ?? 0) * relativeY1
            ) +
                (PERLIN_GRADIENT_Z[gradient110] ?? 0) * relativeZ
        );
        const d001 = f32(
            f32((PERLIN_GRADIENT_X[gradient001] ?? 0) * relativeX + (PERLIN_GRADIENT_Y[gradient001] ?? 0) * relativeY) +
                (PERLIN_GRADIENT_Z[gradient001] ?? 0) * relativeZ1
        );
        const d101 = f32(
            f32(
                (PERLIN_GRADIENT_X[gradient101] ?? 0) * relativeX1 + (PERLIN_GRADIENT_Y[gradient101] ?? 0) * relativeY
            ) +
                (PERLIN_GRADIENT_Z[gradient101] ?? 0) * relativeZ1
        );
        const d011 = f32(
            f32(
                (PERLIN_GRADIENT_X[gradient011] ?? 0) * relativeX + (PERLIN_GRADIENT_Y[gradient011] ?? 0) * relativeY1
            ) +
                (PERLIN_GRADIENT_Z[gradient011] ?? 0) * relativeZ1
        );
        const d111 = f32(
            f32(
                (PERLIN_GRADIENT_X[gradient111] ?? 0) * relativeX1 + (PERLIN_GRADIENT_Y[gradient111] ?? 0) * relativeY1
            ) +
                (PERLIN_GRADIENT_Z[gradient111] ?? 0) * relativeZ1
        );
        // `lerp3F` spelled out. Its helper calls are not inlined on this hot path; these
        // seven operations retain the same x-then-y-then-z order and f32 rounding as lerp3F.
        const alphaX = smoothstep(relativeX);
        const alphaY = smoothstep(originalRelativeY);
        const p0 = f32(d000 + f32(alphaX * f32(d100 - d000)));
        const p1 = f32(d010 + f32(alphaX * f32(d110 - d010)));
        const q0 = f32(p0 + f32(alphaY * f32(p1 - p0)));
        const p2 = f32(d001 + f32(alphaX * f32(d101 - d001)));
        const p3 = f32(d011 + f32(alphaX * f32(d111 - d011)));
        const q1 = f32(p2 + f32(alphaY * f32(p3 - p2)));
        return f32(q0 + f32(smoothstep(relativeZ) * f32(q1 - q0)));
    }
}
