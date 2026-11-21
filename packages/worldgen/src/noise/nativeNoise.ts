import { NativeLibraryError } from '@jsprismarine/errors/native-library';
import { NativeWorldgen } from '@jsprismarine/native-worldgen';
import type { NativeNoiseLayer, NativeNoiseStack } from '@jsprismarine/native-worldgen';

import type { Noise } from './GradientNoise';
import { NoiseStack } from './NoiseStack';
import { PerlinNoise } from './PerlinNoise';
import { SmearedPerlinNoise } from './SmearedPerlinNoise';

/** The library this thread loaded: undefined until asked, null when there is no usable build. */
let loaded: NativeWorldgen | null | undefined;

/**
 * The native worldgen library for this thread, loaded on first use.
 *
 * The library is optional: without a build for the machine, or under a runtime without an FFI,
 * worldgen keeps its TypeScript noise and gives the same bits either way.
 * @returns The library, or undefined when it cannot be loaded here.
 */
export const nativeWorldgen = (): NativeWorldgen | undefined => {
    if (loaded === undefined) {
        try {
            loaded = NativeWorldgen.load();
        } catch (error: unknown) {
            if (!(error instanceof NativeLibraryError)) throw error;
            loaded = null;
        }
    }
    return loaded ?? undefined;
};

/**
 * A {@link NoiseStack} whose three-dimensional samples run in the native library. Two-dimensional
 * samples stay on the TypeScript stack, which nothing on the hot path calls.
 */
export class NativeStackNoise implements Noise {
    private readonly native: NativeNoiseStack;
    /** The TypeScript stack it mirrors, with the same bits. */
    public readonly stack: NoiseStack;

    public constructor(native: NativeNoiseStack, stack: NoiseStack) {
        this.native = native;
        this.stack = stack;
    }

    /** @inheritDoc */
    public get3(x: number, y: number, z: number): number {
        return this.native.get3(x, y, z);
    }

    /** @inheritDoc */
    public get2(x: number, z: number): number {
        return this.stack.get2(x, z);
    }
}

/**
 * The native mirror of a noise, when the kernel reproduces it: a {@link NoiseStack} of Perlin
 * octaves, plain as every `worldgen/noise` entry builds them or smeared as old blended noise
 * builds them. Simplex noise has no kernel yet.
 * @param library - The loaded library.
 * @param noise - A seeded noise.
 * @returns The native noise, or the same noise when the kernel does not cover it.
 */
export const withNativeStack = (library: NativeWorldgen, noise: Noise): Noise => {
    if (!(noise instanceof NoiseStack)) return noise;
    const layers: NativeNoiseLayer[] = [];
    for (const layer of noise.layers) {
        const perlin = layer.noise;
        // Exactly one of the two classes the kernel reproduces: another subclass samples differently.
        const smeared = perlin instanceof SmearedPerlinNoise && perlin.constructor === SmearedPerlinNoise;
        if (!smeared && (!(perlin instanceof PerlinNoise) || perlin.constructor !== PerlinNoise)) return noise;
        layers.push({
            permutation: perlin.permutationTable(),
            offsetX: perlin.offsetX,
            offsetY: perlin.offsetY,
            offsetZ: perlin.offsetZ,
            frequency: layer.frequency,
            amplitude: layer.amplitude,
            ...(smeared ? { smearY: perlin.fudgeYScale } : {})
        });
    }
    return new NativeStackNoise(library.createStack(layers), noise);
};
