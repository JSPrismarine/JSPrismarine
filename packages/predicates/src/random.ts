/**
 * The only source of randomness the evaluator uses. Injecting it is what makes
 * a loot roll, a `random_chance` check or a `uniform` provider reproducible in
 * a test.
 */
export interface RandomSource {
    /** Returns a float in the half-open interval `[0, 1)`. */
    nextFloat(): number;
    /** Returns an integer in the half-open interval `[0, bound)`. */
    nextInt(bound: number): number;
}

const toInt = (value: number, bound: number): number => {
    if (bound <= 0) return 0;
    return Math.min(bound - 1, Math.max(0, Math.floor(value * bound)));
};

/**
 * A source that replays `values` in order and starts over when it runs out.
 * `nextInt` scales the same float into the bound.
 */
export const scriptedRandom = (values: readonly number[]): RandomSource => {
    if (values.length === 0) throw new Error('scriptedRandom needs at least one value');

    let cursor = 0;
    const next = (): number => {
        const value = values[cursor % values.length]!;
        cursor += 1;
        return value;
    };

    return { nextFloat: next, nextInt: (bound) => toInt(next(), bound) };
};

/** A source that always draws the same float. */
export const constantRandom = (value: number): RandomSource => ({
    nextFloat: () => value,
    nextInt: (bound) => toInt(value, bound)
});

/**
 * A mulberry32 generator. It is not Java's `Random`, so it reproduces runs of
 * this server rather than Java Edition's exact draws; use it where a test needs
 * many values rather than a scripted few.
 */
export const seededRandom = (seed: number): RandomSource => {
    let state = seed >>> 0;
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };

    return { nextFloat: next, nextInt: (bound) => toInt(next(), bound) };
};
