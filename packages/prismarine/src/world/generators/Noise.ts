/**
 * Deterministic value noise, enough to shape terrain without pulling in a dependency.
 *
 * Everything derives from the world seed by integer hashing, so the same seed and the same
 * coordinates always give the same result - and, more importantly, a coordinate gives the
 * same result no matter which chunk asked for it. That is what makes chunks line up at
 * their edges instead of forming cliffs.
 */
export class Noise {
    private readonly seed: number;

    public constructor(seed: number) {
        // Keep the seed in 32 bit range; the hash below is 32 bit arithmetic throughout.
        this.seed = seed | 0;
    }

    /** A hash of integer coordinates, uniform in [0, 1). The z term is free for 2D use. */
    private hash(x: number, y: number, z = 0): number {
        let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ this.seed;
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        h ^= h >>> 15;

        return (h >>> 0) / 0x100000000;
    }

    /** Smoothstep, so cell boundaries have no visible seam or crease. */
    private static fade(t: number): number {
        return t * t * (3 - 2 * t);
    }

    /** Value noise at a point, interpolating the four surrounding lattice corners. */
    public at(x: number, y: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = Noise.fade(x - x0);
        const fy = Noise.fade(y - y0);

        const top = this.hash(x0, y0) * (1 - fx) + this.hash(x0 + 1, y0) * fx;
        const bottom = this.hash(x0, y0 + 1) * (1 - fx) + this.hash(x0 + 1, y0 + 1) * fx;

        return top * (1 - fy) + bottom * fy;
    }

    /** The same interpolation in three dimensions, for anything shaped through a volume. */
    public at3(x: number, y: number, z: number): number {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const z0 = Math.floor(z);
        const fx = Noise.fade(x - x0);
        const fy = Noise.fade(y - y0);
        const fz = Noise.fade(z - z0);

        const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
        const corner = (dy: number, dz: number) =>
            lerp(this.hash(x0, y0 + dy, z0 + dz), this.hash(x0 + 1, y0 + dy, z0 + dz), fx);

        const near = lerp(corner(0, 0), corner(1, 0), fy);
        const far = lerp(corner(0, 1), corner(1, 1), fy);

        return lerp(near, far, fz);
    }

    /** {@link fractal} in three dimensions. @returns a value in [0, 1]. */
    public fractal3(x: number, y: number, z: number, octaves = 3, persistence = 0.5): number {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maximum = 0;

        for (let octave = 0; octave < octaves; octave++) {
            total += this.at3(x * frequency, y * frequency, z * frequency) * amplitude;
            maximum += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return total / maximum;
    }

    /**
     * Several octaves summed, each half the amplitude and twice the frequency of the last.
     * One octave alone gives rolling hills with no detail; this adds the smaller bumps.
     * @returns a value in [0, 1].
     */
    public fractal(x: number, y: number, octaves = 4, persistence = 0.5): number {
        let total = 0;
        let amplitude = 1;
        let frequency = 1;
        let maximum = 0;

        for (let octave = 0; octave < octaves; octave++) {
            total += this.at(x * frequency, y * frequency) * amplitude;
            maximum += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return total / maximum;
    }
}

export default Noise;
