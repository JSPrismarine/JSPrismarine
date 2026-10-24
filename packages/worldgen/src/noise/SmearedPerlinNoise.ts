import { f32, floor } from '../math';
import type { RandomSource } from '../random/RandomSource';
import { wrap } from './GradientNoise';
import { PerlinNoise } from './PerlinNoise';

const SHIFT_UP_EPSILON = f32(1e-7);

/**
 * Perlin noise whose y fraction is snapped down to a multiple of `fudgeYScale` before the
 * lattice lookup while the interpolation weight stays on the unsnapped fraction.
 *
 * This is the "smearing" that gives Java Edition's old blended noise its vertically stretched
 * cave shapes. Only the blended noise builder builds these.
 */
export class SmearedPerlinNoise extends PerlinNoise {
    public constructor(
        random: RandomSource,
        private readonly fudgeYScale: number
    ) {
        super(random);
    }

    /** @inheritDoc */
    public override get3(x: number, y: number, z: number): number {
        const wrappedX = wrap(x) + this.offsetX;
        const wrappedY = wrap(y) + this.offsetY;
        const wrappedZ = wrap(z) + this.offsetZ;
        const floorX = floor(wrappedX);
        const floorY = floor(wrappedY);
        const floorZ = floor(wrappedZ);
        const relativeX = f32(wrappedX - floorX);
        const relativeY = wrappedY - floorY;
        const relativeZ = f32(wrappedZ - floorZ);
        const fudgedRelativeY = f32(relativeY - this.computeFudgeY(y, relativeY));
        return this.sampleAndLerp(floorX, floorY, floorZ, relativeX, fudgedRelativeY, relativeZ, f32(relativeY));
    }

    private computeFudgeY(originalY: number, relativeY: number): number {
        const fudgeLimit = originalY >= 0 && originalY < relativeY ? originalY : relativeY;
        return floor(fudgeLimit / this.fudgeYScale + SHIFT_UP_EPSILON) * this.fudgeYScale;
    }
}
