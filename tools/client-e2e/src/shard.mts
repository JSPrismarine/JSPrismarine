/** Splitting a run's suites across CI runners, so each runner plays a share of the scenarios. */

/** A group of scenarios that share one server and client, as far as sharding reads it. */
export interface Suite {
    name: string;
    scenarios: readonly unknown[];
}

/** One shard of a run, as `--shard` takes it: `2/4` is the second of four. */
export interface Shard {
    index: number;
    total: number;
}

/**
 * Reads a `--shard` value.
 *
 * @param value - `<index>/<total>`, counting from 1.
 * @returns The shard, or an error message naming what is wrong with the value.
 */
export const parseShard = (value: string): Shard | string => {
    const match = /^(\d+)\/(\d+)$/.exec(value);
    if (!match) return `--shard must look like 2/4, not ${value}`;
    const index = Number(match[1]);
    const total = Number(match[2]);
    if (total < 1 || index < 1 || index > total) return `--shard ${value} names no shard of ${total}`;
    return { index, total };
};

/** How much of a shard a suite takes up: its scenario count, or a weight from recorded times. */
export type SuiteWeight = (suite: Suite) => number;

/** The default weight: how many scenarios the suite plays. */
export const scenarioCount: SuiteWeight = (suite) => suite.scenarios.length;

const median = (values: readonly number[]): number | undefined => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Weighs suites by the time an earlier run recorded for each, so shards end up close in time
 * rather than in scenario count.
 *
 * A suite's recorded time covers every scenario it has, and a selection can play a few of them,
 * so each suite gets a rate per scenario from its full scenario count, and a suite without a
 * recorded time the median rate of the ones with one. With no times at all, every suite weighs
 * its scenario count.
 *
 * @param times - Seconds per suite name, as an earlier run's `suite-times.json` recorded them.
 * @param fullSuites - Every suite with all its scenarios, which the times were recorded for.
 * @returns The weight of a suite, possibly with only some of its scenarios.
 */
export const weightByTimes = (times: ReadonlyMap<string, number>, fullSuites: readonly Suite[]): SuiteWeight => {
    const rates = new Map<string, number>();
    for (const suite of fullSuites) {
        const time = times.get(suite.name);
        if (time !== undefined && suite.scenarios.length > 0) rates.set(suite.name, time / suite.scenarios.length);
    }
    const typical = median([...rates.values()]);
    if (typical === undefined) return scenarioCount;
    return (suite) => (rates.get(suite.name) ?? typical) * suite.scenarios.length;
};

/**
 * Picks the suites one shard runs.
 *
 * Whole suites go to shards, since a suite's scenarios share one world and run in order. The
 * heaviest suite goes first, each to the shard with the least weight so far, the earlier shard on
 * a tie, so the shards end up close in weight. Every runner computes the same split from the same
 * suites and weights, so no job has to pass the assignment on.
 *
 * @param suites - The run's suites, in the order they run.
 * @param shard - The shard to pick for.
 * @param weight - What a suite adds to its shard; scenario count unless times are known.
 * @returns The shard's suites, in their original order. Empty when there are fewer suites than
 * shards and this one got none.
 */
export const shardSuites = <T extends Suite>(
    suites: readonly T[],
    shard: Shard,
    weight: SuiteWeight = scenarioCount
): T[] => {
    const loads = new Array<number>(shard.total).fill(0);
    const owner = new Map<T, number>();
    const heaviestFirst = suites
        .map((suite, order) => ({ suite, order, weight: weight(suite) }))
        .sort((a, b) => b.weight - a.weight || a.order - b.order);
    for (const { suite, weight: load } of heaviestFirst) {
        const lightest = loads.indexOf(Math.min(...loads));
        loads[lightest] = (loads[lightest] ?? 0) + load;
        owner.set(suite, lightest);
    }
    return suites.filter((suite) => owner.get(suite) === shard.index - 1);
};
