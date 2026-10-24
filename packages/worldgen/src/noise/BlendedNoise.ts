import { clamp, f32, lerpF } from '../math';
import type { RandomSource } from '../random/RandomSource';
import type { NoiseStack } from './NoiseStack';
import { NoiseStackBuilder } from './NoiseStack';
import { SmearedPerlinNoise } from './SmearedPerlinNoise';

const BASE_SCALE = 684.412;
const LIMIT_FACTOR = f32(0.99998474);
const MAIN_FACTOR = 12.75;
const LIMIT_FIRST_OCTAVE = -15;
const MAIN_FIRST_OCTAVE = -7;

/** The registry name the random source for old blended noise is keyed by. */
export const BLENDED_NOISE_SEED = 'minecraft:terrain';

/** The five scale parameters of an `old_blended_noise` density function. */
export interface BlendedNoiseParameters {
    /** Horizontal coordinate scale, multiplied by 684.412. */
    readonly xzScale: number;
    /** Vertical coordinate scale, multiplied by 684.412. */
    readonly yScale: number;
    /** Divides the horizontal scale of the selector noise. */
    readonly xzFactor: number;
    /** Divides the vertical scale of the selector noise. */
    readonly yFactor: number;
    /** Multiplies the vertical smear of the two limit noises. */
    readonly smearScaleMultiplier: number;
}

/**
 * Builds one fractal Brownian motion stack of smeared Perlin octaves, highest frequency first.
 *
 * @throws When `firstOctave` is positive, which Java rejects.
 */
export const createFbm = (
    random: RandomSource,
    firstOctave: number,
    smearScaleY: number,
    valueFactor: number
): NoiseStack => {
    if (firstOctave > 0) throw new RangeError('firstOctave>0');

    const octaves = -firstOctave + 1;
    let factor = 1;
    let weight = valueFactor / (2 ** octaves - 1);
    const stack = new NoiseStackBuilder();
    for (let i = octaves - 1; i >= 0; i--) {
        stack.add(new SmearedPerlinNoise(random, smearScaleY * factor), factor, f32(weight));
        factor /= 2;
        weight *= 2;
    }
    return stack.build();
};

/** The three octave stacks `old_blended_noise` samples: two limits and one selector. */
export interface BlendedNoiseFbmSet {
    /** The lower limit noise. */
    readonly minLimitNoise: NoiseStack;
    /** The upper limit noise. */
    readonly maxLimitNoise: NoiseStack;
    /** The selector noise that chooses between the two limits. */
    readonly mainNoise: NoiseStack;
}

/** Draws the three octave stacks from one random source, in Java's order. */
export const createBlendedNoiseFbmSet = (
    random: RandomSource,
    parameters: BlendedNoiseParameters
): BlendedNoiseFbmSet => {
    const limitSmearScaleY = BASE_SCALE * parameters.yScale * parameters.smearScaleMultiplier;
    const mainSmearScaleY = limitSmearScaleY / parameters.yFactor;
    return {
        minLimitNoise: createFbm(random, LIMIT_FIRST_OCTAVE, limitSmearScaleY, LIMIT_FACTOR),
        maxLimitNoise: createFbm(random, LIMIT_FIRST_OCTAVE, limitSmearScaleY, LIMIT_FACTOR),
        mainNoise: createFbm(random, MAIN_FIRST_OCTAVE, mainSmearScaleY, MAIN_FACTOR)
    };
};

/**
 * Compiles an `old_blended_noise` density function into a position sampler.
 *
 * The selector noise is shifted by 0.5, clamped to `[0, 1]` and used to interpolate between
 * the two limit noises, which is the pre-1.18 terrain shape Java still ships for the nether,
 * the caves preset and the floating islands preset.
 */
export const createBlendedNoiseSampler = (
    random: RandomSource,
    parameters: BlendedNoiseParameters
): ((x: number, y: number, z: number) => number) => {
    const { minLimitNoise, maxLimitNoise, mainNoise } = createBlendedNoiseFbmSet(random, parameters);
    const xzMultiplier = BASE_SCALE * parameters.xzScale;
    const yMultiplier = BASE_SCALE * parameters.yScale;
    const mainXzMultiplier = xzMultiplier / parameters.xzFactor;
    const mainYMultiplier = yMultiplier / parameters.yFactor;

    return (x, y, z) => {
        const selector = clamp(
            f32(mainNoise.get3(x * mainXzMultiplier, y * mainYMultiplier, z * mainXzMultiplier) + 0.5),
            0,
            1
        );
        const low = minLimitNoise.get3(x * xzMultiplier, y * yMultiplier, z * xzMultiplier);
        const high = maxLimitNoise.get3(x * xzMultiplier, y * yMultiplier, z * xzMultiplier);
        if (selector === 0) return low;
        if (selector === 1) return high;
        return lerpF(selector, low, high);
    };
};
