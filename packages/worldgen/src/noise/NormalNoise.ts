import { f32 } from '../math';
import type { RandomSource } from '../random/RandomSource';
import type { Noise } from './GradientNoise';
import { createLegacyNetherFbm } from './LegacyFbmInitializer';
import type { NoiseStack } from './NoiseStack';
import { NoiseStackBuilder } from './NoiseStack';
import { PerlinNoise } from './PerlinNoise';

const TARGET_DEVIATION = 1 / 3;
const INPUT_FACTOR = 1.0181268882175227;

/** How a noise's octave amplitudes are scaled before sampling. */
export type NoiseNormalization = 'disabled' | 'enabled' | 'legacy';

/**
 * The contents of one `worldgen/noise` JSON file.
 *
 * 26.3 renamed these fields: 1.21's `firstOctave` and `amplitudes` became `base_octave`,
 * `octave_count`, `base_amplitude` and `amplitude_modifiers`, and the octave seeds changed from
 * a chained random to `fromHashOf("octave_<index>")`. A loader written for the old shape
 * produces different terrain rather than an error.
 */
export interface NoiseParameters {
    /** The amplitude of the first octave before normalization. */
    readonly baseAmplitude: number;
    /** The exponent of the first octave's frequency, so frequency is `2 ** baseOctave`. */
    readonly baseOctave: number;
    /** How many octaves the noise has. */
    readonly octaveCount: number;
    /** Whether the octave amplitudes are rescaled to the target deviation. */
    readonly normalize: NoiseNormalization;
    /** Per-octave amplitude multipliers, empty when every octave uses 1. */
    readonly amplitudeModifiers: readonly number[];
}

interface OctaveInfo {
    readonly octaveIndex: number;
    readonly frequency: number;
    readonly amplitude: number;
}

const readNumber = (value: unknown, field: string, fallback?: number): number => {
    if (value === undefined) {
        if (fallback !== undefined) return fallback;
        throw new TypeError(`Noise parameters are missing the required field ${field}`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`Noise parameter ${field} must be a finite number`);
    }
    return value;
};

const readNormalization = (value: unknown): NoiseNormalization => {
    if (value === undefined) return 'enabled';
    if (value === true) return 'enabled';
    if (value === false) return 'disabled';
    if (value === 'legacy') return 'legacy';
    throw new TypeError(`Noise parameter normalize must be a boolean or "legacy", got ${JSON.stringify(value)}`);
};

/**
 * Reads one `worldgen/noise` JSON document.
 *
 * @throws When a field is missing, has the wrong type, or when `amplitude_modifiers` is present
 *   with a length other than `octave_count`, which is the validation Java applies.
 */
export const parseNoiseParameters = (source: unknown): NoiseParameters => {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
        throw new TypeError('Noise parameters must be a JSON object');
    }
    // A parsed JSON document is `unknown`; the reads below check every field.
    const raw = source as Record<string, unknown>;

    const baseOctave = readNumber(raw['base_octave'], 'base_octave');
    const octaveCount = readNumber(raw['octave_count'], 'octave_count', 1);
    const baseAmplitude = readNumber(raw['base_amplitude'], 'base_amplitude', 1);
    const modifierSource = raw['amplitude_modifiers'];
    if (modifierSource !== undefined && !Array.isArray(modifierSource)) {
        throw new TypeError('Noise parameter amplitude_modifiers must be an array');
    }
    const amplitudeModifiers = (modifierSource ?? []).map((entry, index) =>
        readNumber(entry, `amplitude_modifiers[${index}]`)
    );

    if (!Number.isInteger(baseOctave) || baseOctave < -32 || baseOctave > 32) {
        throw new RangeError(`Noise parameter base_octave must be an integer in [-32, 32], got ${baseOctave}`);
    }
    if (!Number.isInteger(octaveCount) || octaveCount < 1 || octaveCount > 32) {
        throw new RangeError(`Noise parameter octave_count must be an integer in [1, 32], got ${octaveCount}`);
    }
    if (amplitudeModifiers.length > 0 && amplitudeModifiers.length !== octaveCount) {
        throw new RangeError(
            `amplitude_modifiers had size ${amplitudeModifiers.length}, but octave_count was ${octaveCount}`
        );
    }

    return {
        baseAmplitude,
        baseOctave,
        octaveCount,
        normalize: readNormalization(raw['normalize']),
        amplitudeModifiers
    };
};

const amplitudeModifier = (modifiers: readonly number[], index: number): number =>
    modifiers.length === 0 ? 1 : (modifiers[index] ?? 0);

const buildOctaves = (
    baseOctave: number,
    baseAmplitude: number,
    octaveCount: number,
    normalize: boolean,
    modifiers: readonly number[]
): OctaveInfo[] => {
    let frequency = 2 ** baseOctave;
    let amplitude = normalize ? baseAmplitude * (0.5 ** -(octaveCount - 1) / (0.5 ** -octaveCount - 1)) : baseAmplitude;

    const octaves: OctaveInfo[] = [];
    for (let i = 0; i < octaveCount; i++) {
        const modifier = amplitudeModifier(modifiers, i);
        if (modifier !== 0) {
            octaves.push({ octaveIndex: baseOctave + i, frequency, amplitude: amplitude * modifier });
        }
        frequency *= 2;
        amplitude *= 0.5;
    }
    return octaves;
};

const estimateDeviation = (octaves: readonly OctaveInfo[]): number => {
    let variance = 0;
    for (const octave of octaves) {
        const layerDeviation = PerlinNoise.STANDARD_DEVIATION * Math.abs(octave.amplitude);
        variance += layerDeviation * layerDeviation;
    }
    return Math.sqrt(variance);
};

const computeNormalizationFactor = (targetAmplitude: number, octaves: readonly OctaveInfo[]): number => {
    const inputDeviation = estimateDeviation(octaves);
    if (inputDeviation === 0) return 0;
    return (targetAmplitude * TARGET_DEVIATION) / (inputDeviation * Math.SQRT2);
};

const parityExpectedDeviation = (octaveSpan: number): number => 0.1 * (1 + 1 / (octaveSpan + 1));

const computeParityNormalizationFactor = (
    baseAmplitude: number,
    octaveCount: number,
    modifiers: readonly number[]
): number => {
    let minOctave = Number.MAX_SAFE_INTEGER;
    let maxOctave = -Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < octaveCount; i++) {
        if (amplitudeModifier(modifiers, i) !== 0) {
            minOctave = Math.min(minOctave, i);
            maxOctave = Math.max(maxOctave, i);
        }
    }
    return (baseAmplitude * 0.5 * TARGET_DEVIATION) / parityExpectedDeviation(maxOctave - minOctave);
};

/**
 * A `worldgen/noise` entry: the octave layout plus the normalization factor derived from it.
 *
 * A single instance is shared across seeds; {@link NormalNoise.create} binds it to a random
 * source to produce the sampleable stack.
 */
export class NormalNoise {
    private readonly octaves: readonly OctaveInfo[];
    private readonly normalizationFactor: number;

    public constructor(
        /** The parsed JSON parameters this noise was built from. */
        public readonly parameters: NoiseParameters
    ) {
        this.octaves = buildOctaves(
            parameters.baseOctave,
            parameters.baseAmplitude,
            parameters.octaveCount,
            parameters.normalize !== 'disabled',
            parameters.amplitudeModifiers
        );

        let factor = computeNormalizationFactor(
            this.octaves.reduce((total, octave) => total + Math.abs(octave.amplitude), 0),
            this.octaves
        );
        if (parameters.normalize === 'legacy' && factor !== 0) {
            factor = computeParityNormalizationFactor(
                parameters.baseAmplitude,
                parameters.octaveCount,
                parameters.amplitudeModifiers
            );
        }
        this.normalizationFactor = factor;
    }

    /**
     * Binds the parameters to a random source, producing the sampleable octave stack.
     *
     * Each octave draws two Perlin instances from two positional factories, both keyed by
     * `octave_<index>`, and the second runs at a slightly irrational frequency ratio so the two
     * never line up.
     */
    public create(random: RandomSource): Noise {
        const firstRandom = random.forkPositional();
        const secondRandom = random.forkPositional();
        const stack = new NoiseStackBuilder();

        for (const octave of this.octaves) {
            const seed = `octave_${octave.octaveIndex}`;
            const valueFactor = f32(this.normalizationFactor * octave.amplitude);
            stack.add(new PerlinNoise(firstRandom.fromHashOf(seed)), octave.frequency, valueFactor);
            stack.add(new PerlinNoise(secondRandom.fromHashOf(seed)), octave.frequency * INPUT_FACTOR, valueFactor);
        }

        return stack.build();
    }

    /**
     * The pre-1.18 construction the nether's temperature and vegetation noises still use, where
     * the octaves come from one chained random source rather than a positional factory.
     */
    public createForLegacyNetherBiome(random: RandomSource): Noise {
        const amplitudes =
            this.parameters.amplitudeModifiers.length > 0
                ? this.parameters.amplitudeModifiers
                : Array.from({ length: this.parameters.octaveCount }, () => 1);

        const first: NoiseStack = createLegacyNetherFbm(random, this.parameters.baseOctave, amplitudes);
        const second: NoiseStack = createLegacyNetherFbm(random, this.parameters.baseOctave, amplitudes);
        const valueFactor = f32(this.normalizationFactor * this.parameters.baseAmplitude);
        return new NoiseStackBuilder()
            .addStack(first, 1, valueFactor)
            .addStack(second, INPUT_FACTOR, valueFactor)
            .build();
    }
}
