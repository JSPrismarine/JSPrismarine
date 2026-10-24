import { f32 } from '../math';
import type { Noise } from './GradientNoise';

/** One octave inside a {@link NoiseStack}: a noise, its coordinate scale and its weight. */
export interface NoiseLayer {
    /** The octave's noise function. */
    readonly noise: Noise;
    /** The factor applied to the sample coordinates. */
    readonly frequency: number;
    /** The single-precision weight applied to the octave's output. */
    readonly amplitude: number;
}

/**
 * A weighted sum of octaves.
 *
 * 26.3 replaced the old `PerlinNoise` octave list with this flat stack, so a normal noise, the
 * three fractal Brownian motion sets of old blended noise, and the legacy nether noises all
 * share one summation path.
 */
export class NoiseStack implements Noise {
    public constructor(
        /** The octaves, summed in order; float rounding makes the order observable. */
        public readonly layers: readonly NoiseLayer[]
    ) {}

    /** @inheritDoc */
    public get3(x: number, y: number, z: number): number {
        let value = 0;
        for (const layer of this.layers) {
            const frequency = layer.frequency;
            value = f32(value + f32(layer.amplitude * layer.noise.get3(x * frequency, y * frequency, z * frequency)));
        }
        return value;
    }

    /** @inheritDoc */
    public get2(x: number, z: number): number {
        let value = 0;
        for (const layer of this.layers) {
            const frequency = layer.frequency;
            value = f32(value + f32(layer.amplitude * layer.noise.get2(x * frequency, z * frequency)));
        }
        return value;
    }
}

/** Collects octaves into a {@link NoiseStack}. */
export class NoiseStackBuilder {
    private readonly layers: NoiseLayer[] = [];

    /** Appends one octave. */
    public add(noise: Noise, frequency: number, amplitude: number): this {
        this.layers.push({ noise, frequency, amplitude });
        return this;
    }

    /** Appends every octave of another stack, scaling its frequencies and amplitudes. */
    public addStack(stack: NoiseStack, frequency: number, amplitude: number): this {
        for (const layer of stack.layers) {
            this.layers.push({
                noise: layer.noise,
                frequency: layer.frequency * frequency,
                amplitude: f32(layer.amplitude * amplitude)
            });
        }
        return this;
    }

    /** Returns the finished stack. */
    public build(): NoiseStack {
        return new NoiseStack(this.layers);
    }
}
