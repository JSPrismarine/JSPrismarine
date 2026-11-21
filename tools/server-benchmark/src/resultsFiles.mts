/**
 * Where results files live under `docs/research/benchmarks/`, and how to read them back in the
 * order the runs started. Each run gets a directory named after its start time, so two runs on one
 * day keep a file each. Runs from before that layout sit under a directory named by date alone, and
 * are read the same way.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from './isRecord.mts';

/**
 * The directory name for a run that started at `startedAt`: the UTC time to the second, without
 * the colons Windows refuses in a path, such as `2026-11-21T031500Z`. The workflow's publish step
 * derives the same name from the file's `startedAt` with `jq`.
 */
export const resultsDirName = (startedAt: Date): string =>
    `${startedAt.toISOString().slice(0, 19).replaceAll(':', '')}Z`;

/** A results file under the benchmarks directory, parsed but not yet checked against a schema. */
export interface StoredResults {
    /** The file's absolute path. */
    readonly file: string;
    readonly results: unknown;
}

/** When a parsed results file says its run started, or an empty string when it says nothing. */
const startedAtOf = (results: unknown) =>
    isRecord(results) && typeof results.startedAt === 'string' ? results.startedAt : '';

/**
 * Every `<dir>/results.json` under `benchmarksDir`, oldest run first by its `startedAt`, or none
 * when the directory is missing. Runs that started at the same time keep their directory order.
 */
export const readResultsFiles = (benchmarksDir: string): StoredResults[] => {
    if (!existsSync(benchmarksDir)) return [];
    return readdirSync(benchmarksDir)
        .sort()
        .map((entry) => path.join(benchmarksDir, entry, 'results.json'))
        .filter((file) => existsSync(file))
        .map((file): StoredResults => ({ file, results: JSON.parse(readFileSync(file, 'utf8')) }))
        .sort((left, right) => startedAtOf(left.results).localeCompare(startedAtOf(right.results)));
};
