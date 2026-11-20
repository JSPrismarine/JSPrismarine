/**
 * Splits Vitest test files into shards of similar recorded duration.
 *
 * `vitest --shard` splits files by count, so one shard can get the slow files and finish minutes
 * after the others. This assigns files longest first, each to the shard with the least recorded
 * time so far, from the per-file times earlier runs' JUnit reports hold. A file with no recorded
 * time counts as the median of the ones that have one.
 *
 * ```
 * node scripts/vitest-shards.mts --shards 3 --junit <directory> < files.txt
 * ```
 *
 * Standard input lists the files, one per line, as `vitest list --filesOnly` prints them. The
 * output is a JSON array with one array of files per shard. Every `*.xml` file under `--junit` is
 * read; a directory that is missing or holds none leaves every file at the same weight.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * Reads each test file's duration from a Vitest JUnit report.
 *
 * @param xml - The report.
 * @returns Seconds per file, by the repository-relative path the report names it by.
 */
export const parseJunitDurations = (xml: string): Map<string, number> => {
    const durations = new Map<string, number>();
    for (const match of xml.matchAll(/<testsuite\b[^>]*>/g)) {
        const name = /\bname="([^"]*)"/.exec(match[0])?.[1];
        const time = Number(/\btime="([^"]*)"/.exec(match[0])?.[1]);
        if (name !== undefined && Number.isFinite(time)) durations.set(name, (durations.get(name) ?? 0) + time);
    }
    return durations;
};

/**
 * Assigns files to shards so the shards' recorded durations end up close.
 *
 * @param files - The files to run.
 * @param durations - Recorded seconds per file.
 * @param shards - How many shards to fill.
 * @returns One list per shard. With at least as many files as shards, none is empty, and the
 * shards' totals differ by no more than the longest file.
 */
export const assignShards = (
    files: readonly string[],
    durations: ReadonlyMap<string, number>,
    shards: number
): string[][] => {
    const known = files.flatMap((file) => {
        const duration = durations.get(file);
        return duration === undefined ? [] : [duration];
    });
    const sorted = [...known].sort((a, b) => a - b);
    const median = sorted.length === 0 ? 1 : (sorted[Math.floor(sorted.length / 2)] ?? 1);
    const weighted = files
        .map((file, order) => ({ file, order, weight: durations.get(file) ?? median }))
        .sort((a, b) => b.weight - a.weight || a.order - b.order);
    const totals = new Array<number>(shards).fill(0);
    const assigned: string[][] = Array.from({ length: shards }, () => []);
    for (const { file, weight } of weighted) {
        // The least time so far, then the fewest files, so files that weigh nothing still spread.
        let lightest = 0;
        for (let shard = 1; shard < shards; shard++) {
            const time = (totals[shard] ?? 0) - (totals[lightest] ?? 0);
            const count = (assigned[shard]?.length ?? 0) - (assigned[lightest]?.length ?? 0);
            if (time < 0 || (time === 0 && count < 0)) lightest = shard;
        }
        totals[lightest] = (totals[lightest] ?? 0) + weight;
        assigned[lightest]?.push(file);
    }
    return assigned;
};

/** Reads every JUnit report under a directory into one map of durations. */
const readDurations = (directory: string | undefined): Map<string, number> => {
    const durations = new Map<string, number>();
    if (directory === undefined || !fs.existsSync(directory)) return durations;
    for (const entry of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.xml')) continue;
        const report = parseJunitDurations(fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'));
        // A file reported by several runs keeps its longest time, the one a shard has to allow for.
        for (const [file, time] of report) durations.set(file, Math.max(durations.get(file) ?? 0, time));
    }
    return durations;
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({ options: { shards: { type: 'string' }, junit: { type: 'string' } } });
    const shards = Number(values.shards);
    if (!Number.isSafeInteger(shards) || shards < 1) throw new Error('--shards must be a positive integer');
    const files = fs
        .readFileSync(0, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
    const durations = readDurations(values.junit);
    const assigned = assignShards(files, durations, shards);
    const timed = files.filter((file) => durations.has(file)).length;
    console.error(`${files.length} files, ${timed} with a recorded time, in ${shards} shards`);
    process.stdout.write(`${JSON.stringify(assigned)}\n`);
}
