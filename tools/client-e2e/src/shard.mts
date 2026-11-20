/** Splitting a run's suites across CI runners, so each runner plays a share of the scenarios. */

/** A group of scenarios that share one server and client, as far as sharding reads it. */
interface Suite {
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

/**
 * Picks the suites one shard runs.
 *
 * Whole suites go to shards, since a suite's scenarios share one world and run in order. The
 * largest suite goes first, each to the shard with the fewest scenarios so far, the earlier shard
 * on a tie, so the shards end up close in scenario count. Every runner computes the same split
 * from the same suites, so no job has to pass the assignment on.
 *
 * @param suites - The run's suites, in the order they run.
 * @param shard - The shard to pick for.
 * @returns The shard's suites, in their original order. Empty when there are fewer suites than
 * shards and this one got none.
 */
export const shardSuites = <T extends Suite>(suites: readonly T[], shard: Shard): T[] => {
    const loads = new Array<number>(shard.total).fill(0);
    const owner = new Map<T, number>();
    const largestFirst = suites
        .map((suite, order) => ({ suite, order }))
        .sort((a, b) => b.suite.scenarios.length - a.suite.scenarios.length || a.order - b.order);
    for (const { suite } of largestFirst) {
        const lightest = loads.indexOf(Math.min(...loads));
        loads[lightest] = (loads[lightest] ?? 0) + suite.scenarios.length;
        owner.set(suite, lightest);
    }
    return suites.filter((suite) => owner.get(suite) === shard.index - 1);
};
