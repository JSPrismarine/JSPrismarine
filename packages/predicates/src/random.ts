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

/** JSON-safe state captured by {@link seededRandom}. */
export interface SeededRandomState {
    readonly version: 1;
    readonly algorithm: 'mulberry32';
    /** The generator's current unsigned 32-bit counter. */
    readonly state: number;
}

/** A seeded source that can resume from a JSON-safe state. */
export interface StatefulRandomSource extends RandomSource {
    /** Returns the state needed to continue this exact stream. */
    saveState(): SeededRandomState;
    /** Resumes this stream from a state produced by {@link seededRandom}. */
    restoreState(state: unknown): void;
}

/** Whether an injected random source can be included in a replay state. */
export const isStatefulRandomSource = (source: RandomSource): source is StatefulRandomSource =>
    'saveState' in source &&
    typeof source.saveState === 'function' &&
    'restoreState' in source &&
    typeof source.restoreState === 'function';

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
export const seededRandom = (seed: number): StatefulRandomSource => {
    let state = seed >>> 0;
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };

    return {
        nextFloat: next,
        nextInt: (bound) => toInt(next(), bound),
        saveState: () => ({ version: 1, algorithm: 'mulberry32', state }),
        restoreState: (saved: unknown) => {
            if (
                typeof saved !== 'object' ||
                saved === null ||
                !('version' in saved) ||
                !('algorithm' in saved) ||
                !('state' in saved)
            ) {
                throw new TypeError('Invalid mulberry32 random state');
            }
            if (
                saved.version !== 1 ||
                saved.algorithm !== 'mulberry32' ||
                typeof saved.state !== 'number' ||
                !Number.isInteger(saved.state) ||
                saved.state < 0 ||
                saved.state > 0xffffffff
            ) {
                throw new TypeError('Invalid mulberry32 random state');
            }
            state = saved.state;
        }
    };
};
