import { f32 } from '../math';
import type { RandomSource } from '../random/RandomSource';
import type { NoiseStack } from './NoiseStack';
import { NoiseStackBuilder } from './NoiseStack';
import { PerlinNoise } from './PerlinNoise';

/** How many random draws one skipped octave consumes, so the stream stays aligned. */
const OCTAVE_DRAWS = 262;

/**
 * Builds the pre-1.18 octave chain the nether's temperature and vegetation noises still use.
 *
 * The octaves are drawn from one random source from the highest frequency downward, and a
 * zero-amplitude octave still consumes its draws, which is why the skip exists at all.
 *
 * @throws When the amplitude list implies a positive octave, which Java rejects outright.
 */
export const createLegacyNetherFbm = (
    random: RandomSource,
    firstOctave: number,
    amplitudes: readonly number[]
): NoiseStack => {
    const octaves = amplitudes.length;
    const zeroOctaveIndex = -firstOctave;
    const noiseLevels: (PerlinNoise | undefined)[] = new Array(octaves).fill(undefined);

    const zeroOctave = new PerlinNoise(random);
    if (zeroOctaveIndex >= 0 && zeroOctaveIndex < octaves && (amplitudes[zeroOctaveIndex] ?? 0) !== 0) {
        noiseLevels[zeroOctaveIndex] = zeroOctave;
    }

    for (let i = zeroOctaveIndex - 1; i >= 0; i--) {
        if (i < octaves && (amplitudes[i] ?? 0) !== 0) {
            noiseLevels[i] = new PerlinNoise(random);
        } else {
            random.consumeCount(OCTAVE_DRAWS);
        }
    }

    if (zeroOctaveIndex < octaves - 1) {
        throw new RangeError('Positive octaves are not supported by the legacy nether noise');
    }

    let factor = 2 ** -zeroOctaveIndex;
    let valueFactor = 2 ** (octaves - 1) / (2 ** octaves - 1);
    const stack = new NoiseStackBuilder();
    for (let i = 0; i < noiseLevels.length; i++) {
        const noise = noiseLevels[i];
        if (noise) stack.add(noise, factor, f32(valueFactor * (amplitudes[i] ?? 0)));
        factor *= 2;
        valueFactor /= 2;
    }
    return stack.build();
};
