import densityVectors from './density.json' with { type: 'json' };
import noiseVectors from './noise.json' with { type: 'json' };
import randomVectors from './random.json' with { type: 'json' };

/**
 * The golden vectors `utils/oracle/DumpWorldgenVectors.java` captures from Java Edition 26.3.
 *
 * Every expected number in this package's parity tests comes from here rather than from a
 * second implementation of the same formula, so a test can disagree with the code.
 */
export const vectors = {
    /** Random source sequences, seed mixing and positional factory output. */
    random: randomVectors,
    /** Perlin, simplex, smeared Perlin, normal and old blended noise samples. */
    noise: noiseVectors,
    /** Noise router and aquifer density function samples for all seven vanilla settings. */
    density: densityVectors
};

/**
 * Reads a `float` out of a vector file.
 *
 * The dumper writes `Float.toString`, the shortest decimal that round-trips to the same
 * `float`. JavaScript parses that decimal as a `double`, so it has to be rounded back to
 * single precision before it can be compared with a value this package computes.
 */
export const expectedFloat = (value: number): number => Math.fround(value);

/** Reads an array of `float` values out of a vector file. */
export const expectedFloats = (values: readonly number[]): number[] => values.map(expectedFloat);

/** The block positions every vector file samples, in the order the arrays use. */
export const VECTOR_POSITIONS: readonly (readonly [number, number, number])[] = [
    [0, 0, 0],
    [1, 2, 3],
    [16, 64, 32],
    [-37, -51, 119],
    [1000, 200, -1000],
    [12345, 7, -54321]
];
