/**
 * Pearson's chi-squared goodness-of-fit test, with the upper tail probability it needs.
 *
 * The loot distribution row rolls a table thousands of times and asks whether the item counts
 * it saw are what the table's declared weights predict. That question has one standard answer,
 * and it needs one number the standard library does not have: the probability that a chi-squared
 * variable with `d` degrees of freedom exceeds the observed statistic.
 *
 * Nothing here is loot-specific, and nothing here reads a file. It is arithmetic with its own
 * tests against published critical values.
 */

/** Lanczos g=7, n=9 coefficients, which give {@link logGamma} about 15 significant digits. */
const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
] as const;

/** Natural log of the gamma function, by the Lanczos approximation with the reflection formula. */
const logGamma = (x: number): number => {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);

    const shifted = x - 1;
    let series = LANCZOS[0];
    for (let index = 1; index < LANCZOS.length; index += 1) series += LANCZOS[index]! / (shifted + index);
    const t = shifted + 7.5;

    return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
};

/** How hard the two series below try before they give up and return what they have. */
const ITERATIONS = 1000;
const TOLERANCE = 1e-14;

/** The regularized lower incomplete gamma P(a, x), by its series expansion. Converges for x < a+1. */
const lowerSeries = (a: number, x: number): number => {
    let term = 1 / a;
    let sum = term;
    for (let index = 1; index < ITERATIONS; index += 1) {
        term *= x / (a + index);
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * TOLERANCE) break;
    }

    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
};

/**
 * The regularized upper incomplete gamma Q(a, x), by its continued fraction in the modified
 * Lentz form. Converges for x >= a+1.
 */
const upperFraction = (a: number, x: number): number => {
    const tiny = 1e-300;
    let b = x + 1 - a;
    let c = 1 / tiny;
    let d = 1 / b;
    let result = d;

    for (let index = 1; index < ITERATIONS; index += 1) {
        const an = -index * (index - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < tiny) d = tiny;
        c = b + an / c;
        if (Math.abs(c) < tiny) c = tiny;
        d = 1 / d;
        const delta = d * c;
        result *= delta;
        if (Math.abs(delta - 1) < TOLERANCE) break;
    }

    return result * Math.exp(-x + a * Math.log(x) - logGamma(a));
};

/**
 * The probability that a chi-squared variable with `degreesOfFreedom` degrees of freedom comes
 * out at or above `statistic`: the p-value of a goodness-of-fit test.
 *
 * @returns A probability in [0, 1]. 1 when the statistic is zero or the test has no degrees of
 * freedom, which is the honest answer for a comparison that could not have come out otherwise.
 */
export const chiSquaredUpperTail = (statistic: number, degreesOfFreedom: number): number => {
    if (degreesOfFreedom <= 0 || statistic <= 0) return 1;

    const a = degreesOfFreedom / 2;
    const x = statistic / 2;

    return x < a + 1 ? 1 - lowerSeries(a, x) : upperFraction(a, x);
};

/** One category of a goodness-of-fit test: what was counted and what the model predicted. */
export interface ChiSquaredCell {
    /** What the category is, used in the diagnostic a failing test prints. */
    readonly label: string;
    readonly observed: number;
    /** The count the model predicts, which has to be above zero. */
    readonly expected: number;
}

/** What a goodness-of-fit test came out as. */
export interface ChiSquaredResult {
    readonly statistic: number;
    readonly degreesOfFreedom: number;
    /** The probability of a statistic this large or larger when the model is right. */
    readonly pValue: number;
    /** The cells the test ran on, after the sparse ones were merged. */
    readonly cells: readonly ChiSquaredCell[];
    /** How many of the given cells went into the combined sparse cell, 0 when none did. */
    readonly merged: number;
}

/** The smallest expected count a cell may carry on its own; below it the cell gets merged. */
export const MINIMUM_EXPECTED = 5;

/**
 * Pearson's goodness-of-fit test over `cells`.
 *
 * Cells whose expected count is under {@link MINIMUM_EXPECTED} are merged into one combined
 * cell, smallest first, because the chi-squared approximation is poor on a sparse cell and
 * merging is the textbook remedy. The degrees of freedom are counted after the merge.
 *
 * @param cells - The categories, whose expected counts should already sum to the observed total.
 * @returns The statistic, its degrees of freedom and its p-value. A test left with fewer than
 * two cells has no degrees of freedom and a p-value of 1: there was nothing it could have found.
 */
export const chiSquaredTest = (cells: readonly ChiSquaredCell[]): ChiSquaredResult => {
    const ordered = [...cells].sort((left, right) => right.expected - left.expected);
    const kept: ChiSquaredCell[] = [];
    let pooledObserved = 0;
    let pooledExpected = 0;
    let merged = 0;

    for (const cell of ordered) {
        if (cell.expected >= MINIMUM_EXPECTED && pooledExpected === 0) {
            kept.push(cell);
            continue;
        }
        // Once one cell is too sparse, every later cell is at most as large, so they all join it.
        pooledObserved += cell.observed;
        pooledExpected += cell.expected;
        merged += 1;
    }

    if (pooledExpected > 0) {
        kept.push({ label: `other (${merged} categories)`, observed: pooledObserved, expected: pooledExpected });
    }

    const statistic = kept.reduce((total, cell) => total + (cell.observed - cell.expected) ** 2 / cell.expected, 0);
    const degreesOfFreedom = Math.max(0, kept.length - 1);

    return {
        statistic,
        degreesOfFreedom,
        pValue: chiSquaredUpperTail(statistic, degreesOfFreedom),
        cells: kept,
        merged
    };
};
