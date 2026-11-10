/** Choosing the scenarios to run a second time, and reading the two runs as one result. */

/** How one scenario ended. */
export interface ScenarioResult {
    name: string;
    ok: boolean;
    note: string;
    /** Set when the scenario failed once and passed when run again. */
    retried?: boolean;
}

/** A group of scenarios, as far as retrying reads it. */
interface Suite<S extends { name: string }> {
    name: string;
    scenarios: S[];
}

/**
 * Builds the suites that run the failed scenarios again.
 *
 * A retry runs on a server and a client of its own, because a failed scenario leaves the world
 * and the client in a state nothing reset.
 *
 * @param suites - The suites of the first run.
 * @param results - Every result of the first run.
 * @returns One suite per first-run suite with a failure, holding its failed scenarios in order.
 */
export const retrySuites = <S extends { name: string }, T extends Suite<S>>(
    suites: readonly T[],
    results: readonly ScenarioResult[]
): T[] => {
    const failed = new Set(results.filter((result) => !result.ok).map((result) => result.name));
    return suites
        .map((suite) => ({
            ...suite,
            name: `${suite.name}-retry`,
            scenarios: suite.scenarios.filter((scenario) => failed.has(scenario.name))
        }))
        .filter((suite) => suite.scenarios.length > 0);
};

/**
 * Reads a first run and its retries as one set of results.
 *
 * @param first - Every result of the first run.
 * @param retries - The results of the scenarios that ran again.
 * @returns The first run's results in order. A scenario that passed its retry passes, marked
 * `retried` and noting how the first attempt failed, so a flaky scenario stays visible.
 */
export const mergeRetries = (
    first: readonly ScenarioResult[],
    retries: readonly ScenarioResult[]
): ScenarioResult[] => {
    const again = new Map(retries.map((result) => [result.name, result]));
    return first.map((result) => {
        const retry = again.get(result.name);
        if (result.ok || retry === undefined) return result;
        if (!retry.ok) return retry;
        return { name: result.name, ok: true, retried: true, note: `passed on retry; first attempt: ${result.note}` };
    });
};
