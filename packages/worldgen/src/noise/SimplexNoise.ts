import { f32, floor } from '../math';
import type { RandomSource } from '../random/RandomSource';
import { GradientNoise, GRADIENTS } from './GradientNoise';

const SQRT_3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT_3 - 1);
const G2 = (3 - SQRT_3) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

/**
 * Simplex noise, which Java Edition uses only for the outer end islands.
 *
 * Unlike Perlin noise, the corner contributions are computed
 * in double precision and only the result narrows to `float`.
 */
export class SimplexNoise extends GradientNoise {
    /** The standard deviation of one simplex octave. */
    public static readonly STANDARD_DEVIATION = 0.42544;

    /**
     * @param discardNoiseOffset - When true the three random coordinate offsets are drawn but
     *   scaled to zero, which is how the end island generator seeds its instance.
     */
    public constructor(random: RandomSource, discardNoiseOffset = false) {
        super(random, discardNoiseOffset ? 0 : 256);
    }

    /** @inheritDoc */
    public get2(x: number, z: number): number {
        const xin = x + this.offsetX;
        const yin = z + this.offsetY;
        const s = (xin + yin) * F2;
        const i = floor(xin + s);
        const j = floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - (i - t);
        const y0 = yin - (j - t);
        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 0xff;
        const jj = j & 0xff;
        const gi0 = this.permute(ii + this.permute(jj)) % 12;
        const gi1 = this.permute(ii + i1 + this.permute(jj + j1)) % 12;
        const gi2 = this.permute(ii + 1 + this.permute(jj + 1)) % 12;
        const n0 = SimplexNoise.cornerNoise(gi0, x0, y0, 0, 0.5);
        const n1 = SimplexNoise.cornerNoise(gi1, x1, y1, 0, 0.5);
        const n2 = SimplexNoise.cornerNoise(gi2, x2, y2, 0, 0.5);
        return f32(70 * (n0 + n1 + n2));
    }

    /** @inheritDoc */
    public get3(x: number, y: number, z: number): number {
        const xin = x + this.offsetX;
        const yin = y + this.offsetY;
        const zin = z + this.offsetZ;
        const s = (xin + yin + zin) * F3;
        const i = floor(xin + s);
        const j = floor(yin + s);
        const k = floor(zin + s);
        const t = (i + j + k) * G3;
        const x0 = xin - (i - t);
        const y0 = yin - (j - t);
        const z0 = zin - (k - t);

        let i1: number;
        let j1: number;
        let k1: number;
        let i2: number;
        let j2: number;
        let k2: number;
        if (x0 >= y0) {
            if (y0 >= z0) {
                [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
            } else if (x0 >= z0) {
                [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
            } else {
                [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
            }
        } else if (y0 < z0) {
            [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
        } else if (x0 < z0) {
            [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
        } else {
            [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
        }

        const ii = i & 0xff;
        const jj = j & 0xff;
        const kk = k & 0xff;
        const gi0 = this.permute(ii + this.permute(jj + this.permute(kk))) % 12;
        const gi1 = this.permute(ii + i1 + this.permute(jj + j1 + this.permute(kk + k1))) % 12;
        const gi2 = this.permute(ii + i2 + this.permute(jj + j2 + this.permute(kk + k2))) % 12;
        const gi3 = this.permute(ii + 1 + this.permute(jj + 1 + this.permute(kk + 1))) % 12;
        const n0 = SimplexNoise.cornerNoise(gi0, x0, y0, z0, 0.6);
        const n1 = SimplexNoise.cornerNoise(gi1, x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, 0.6);
        const n2 = SimplexNoise.cornerNoise(gi2, x0 - i2 + F3, y0 - j2 + F3, z0 - k2 + F3, 0.6);
        const n3 = SimplexNoise.cornerNoise(gi3, x0 - 1 + 0.5, y0 - 1 + 0.5, z0 - 1 + 0.5, 0.6);
        return f32(32 * (n0 + n1 + n2 + n3));
    }

    private static cornerNoise(index: number, x: number, y: number, z: number, base: number): number {
        let t = base - x * x - y * y - z * z;
        if (t < 0) return 0;
        t *= t;
        const gradient = GRADIENTS[index] ?? GRADIENTS[0];
        if (!gradient) return 0;
        return t * t * (gradient[0] * x + gradient[1] * y + gradient[2] * z);
    }
}
