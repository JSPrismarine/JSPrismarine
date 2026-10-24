import { describe, expect, it } from 'vitest';

import { LegacyRandomSource } from '../random/LegacyRandomSource';
import type { RandomSource } from '../random/RandomSource';
import { XoroshiroRandomSource } from '../random/XoroshiroRandomSource';
import { expectedFloat, vectors } from '../../vectors/vectors';
import { createBlendedNoiseSampler } from './BlendedNoise';
import type { Noise } from './GradientNoise';
import { wrap } from './GradientNoise';
import { NormalNoise, parseNoiseParameters } from './NormalNoise';
import { PerlinNoise } from './PerlinNoise';
import { SimplexNoise } from './SimplexNoise';
import { SmearedPerlinNoise } from './SmearedPerlinNoise';

interface NoiseSample {
    at: number[];
    value3d: number;
    value2d: number;
}

const xoroshiro = (): RandomSource => XoroshiroRandomSource.fromSeed(1234n);

const checkSamples = (expected: NoiseSample[], noise: Noise): void => {
    for (const sample of expected) {
        const [x = 0, y = 0, z = 0] = sample.at;
        expect(noise.get3(x * 0.25, y * 0.125, z * 0.25)).toBe(expectedFloat(sample.value3d));
        expect(noise.get2(x * 0.25, z * 0.25)).toBe(expectedFloat(sample.value2d));
    }
};

describe('coordinate wrapping', () => {
    it('leaves coordinates inside the representable band untouched', () => {
        expect(wrap(0)).toBe(0);
        expect(wrap(-1234.5)).toBe(-1234.5);
    });

    it('folds coordinates beyond 2^24 back toward the origin', () => {
        // 2^25 is the fold period, so a coordinate one period out lands back on itself.
        expect(wrap(33554432)).toBe(0);
        expect(wrap(33554432 + 7.5)).toBe(7.5);
    });
});

describe('PerlinNoise', () => {
    it('matches Java for a Xoroshiro-seeded octave', () => {
        checkSamples(vectors.noise.perlin, new PerlinNoise(xoroshiro()));
    });

    it('matches Java for a legacy-seeded octave', () => {
        checkSamples(vectors.noise.legacyPerlin, new PerlinNoise(new LegacyRandomSource(1234n)));
    });
});

describe('SimplexNoise', () => {
    it('matches Java with the default coordinate offsets', () => {
        checkSamples(vectors.noise.simplex, new SimplexNoise(xoroshiro()));
    });

    it('matches Java with the offsets discarded, as the end islands use it', () => {
        checkSamples(vectors.noise.simplexNoOffset, new SimplexNoise(xoroshiro(), true));
    });
});

describe('SmearedPerlinNoise', () => {
    it('matches Java for a smear scale of 8', () => {
        checkSamples(vectors.noise.smearedPerlin, new SmearedPerlinNoise(xoroshiro(), 8));
    });
});

describe('NormalNoise', () => {
    it('matches Java for the vanilla continentalness parameters', () => {
        const parameters = parseNoiseParameters({
            base_octave: -9,
            octave_count: 9,
            base_amplitude: 0.8880832896205223,
            amplitude_modifiers: [1, 1, 2, 2, 2, 1, 1, 1, 1]
        });
        checkSamples(vectors.noise.normalContinentalness, new NormalNoise(parameters).create(xoroshiro()));
    });

    it('matches Java for a single-octave noise with defaulted fields', () => {
        const parameters = parseNoiseParameters({ base_octave: -3, base_amplitude: 0.955388882960065 });
        expect(parameters.octaveCount).toBe(1);
        expect(parameters.normalize).toBe('enabled');
        checkSamples(vectors.noise.normalAquiferBarrier, new NormalNoise(parameters).create(xoroshiro()));
    });

    it('matches Java when normalization is disabled', () => {
        const parameters = parseNoiseParameters({
            base_octave: -5,
            octave_count: 3,
            base_amplitude: 1,
            normalize: false
        });
        checkSamples(vectors.noise.normalUnnormalized, new NormalNoise(parameters).create(xoroshiro()));
    });

    it('rejects an amplitude modifier list that does not match the octave count', () => {
        expect(() => parseNoiseParameters({ base_octave: -3, octave_count: 2, amplitude_modifiers: [1] })).toThrow(
            /amplitude_modifiers had size 1, but octave_count was 2/
        );
    });

    it('rejects a missing base octave', () => {
        expect(() => parseNoiseParameters({ octave_count: 2 })).toThrow(/base_octave/);
    });

    it('rejects an octave count outside the range Java accepts', () => {
        expect(() => parseNoiseParameters({ base_octave: 0, octave_count: 33 })).toThrow(RangeError);
        expect(() => parseNoiseParameters({ base_octave: 40 })).toThrow(RangeError);
    });

    it('is deterministic for one seed', () => {
        const parameters = parseNoiseParameters({ base_octave: -7, octave_count: 4 });
        const first = new NormalNoise(parameters).create(xoroshiro());
        const second = new NormalNoise(parameters).create(xoroshiro());
        for (let i = 0; i < 16; i++) {
            expect(first.get3(i * 1.5, i * 0.25, -i)).toBe(second.get3(i * 1.5, i * 0.25, -i));
        }
    });
});

describe('old blended noise', () => {
    it('matches Java for the parameters the caves preset uses', () => {
        const sample = createBlendedNoiseSampler(xoroshiro(), {
            xzScale: 0.25,
            yScale: 0.125,
            xzFactor: 80,
            yFactor: 160,
            smearScaleMultiplier: 8
        });
        for (const entry of vectors.noise.oldBlendedNoise) {
            const [x = 0, y = 0, z = 0] = entry.at;
            expect(sample(x, y, z)).toBe(expectedFloat(entry.value));
        }
    });
});
