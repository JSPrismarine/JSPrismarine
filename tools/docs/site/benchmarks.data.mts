import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESULTS_SCHEMA } from '../../server-benchmark/src/results.mts';
import { buildHistory } from '../../server-benchmark/src/history.mts';
import { readResultsFiles } from '../../server-benchmark/src/resultsFiles.mts';
import { summarize } from '../../server-benchmark/src/summary.mts';

import type { BenchmarkHistory, ResultsFile } from '../../server-benchmark/src/history.mts';
import type { BenchmarkResults } from '../../server-benchmark/src/results.mts';
import type { ResultsSummary } from '../../server-benchmark/src/summary.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** Where `pnpm run bench:servers` writes each benchmark, one directory per run named by its start time. */
const benchmarksDir = path.join(repoRoot, 'docs', 'research', 'benchmarks');

/** What the benchmark page renders: the newest results file, its medians, and every run before it. */
export interface BenchmarkPageData {
    /** The results file, relative to the repository root. */
    readonly file: string;
    readonly results: BenchmarkResults;
    readonly summary: ResultsSummary;
    readonly history: BenchmarkHistory;
}

/** Every `docs/research/benchmarks/<run>/results.json`, oldest run first. */
export function readBenchmarks(): ResultsFile[] {
    return readResultsFiles(benchmarksDir).map(({ file, results: parsed }) => {
        // The harness writes this file from the typed `BenchmarkResults`; the schema check below
        // refuses a file written under a different meaning.
        const results = parsed as BenchmarkResults;
        if (results.schema !== RESULTS_SCHEMA) {
            throw new Error(
                `${path.relative(repoRoot, file)} has results schema ${results.schema}, and the page reads ${RESULTS_SCHEMA}`
            );
        }
        return { file: path.relative(repoRoot, file).split(path.sep).join('/'), results };
    });
}

/** The newest results file with its summary and the history of every file, or null when there is none. */
export function readBenchmarkPage(): BenchmarkPageData | null {
    const files = readBenchmarks();
    const newest = files.at(-1);
    if (newest === undefined) return null;
    return { ...newest, summary: summarize(newest.results), history: buildHistory(files) };
}

declare const data: BenchmarkPageData | null;
export { data };

export default {
    watch: ['../../../docs/research/benchmarks/*/results.json'],
    load(): BenchmarkPageData | null {
        const page = readBenchmarkPage();
        if (!page)
            console.warn('No server benchmark results under docs/research/benchmarks; run pnpm run bench:servers.');
        return page;
    }
};
