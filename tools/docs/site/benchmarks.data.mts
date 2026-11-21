import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESULTS_SCHEMA } from '../../server-benchmark/src/results.mts';
import { summarize } from '../../server-benchmark/src/summary.mts';

import type { BenchmarkResults } from '../../server-benchmark/src/results.mts';
import type { ResultsSummary } from '../../server-benchmark/src/summary.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** Where `pnpm run bench:servers` writes each benchmark, one dated directory per run. */
const benchmarksDir = path.join(repoRoot, 'docs', 'research', 'benchmarks');

/** What the benchmark page renders: the newest results file and the medians computed from it. */
export interface BenchmarkPageData {
    /** The results file, relative to the repository root. */
    readonly file: string;
    readonly results: BenchmarkResults;
    readonly summary: ResultsSummary;
}

/** The newest `docs/research/benchmarks/<date>/results.json`, or null when there is none. */
export function readNewestBenchmark(): BenchmarkPageData | null {
    if (!existsSync(benchmarksDir)) return null;
    const newest = readdirSync(benchmarksDir)
        .filter((entry) => existsSync(path.join(benchmarksDir, entry, 'results.json')))
        .sort()
        .at(-1);
    if (newest === undefined) return null;
    const file = path.join(benchmarksDir, newest, 'results.json');
    // The harness writes this file from the typed `BenchmarkResults`; the schema check below
    // refuses a file written under a different meaning.
    const results = JSON.parse(readFileSync(file, 'utf8')) as BenchmarkResults;
    if (results.schema !== RESULTS_SCHEMA) {
        throw new Error(
            `${path.relative(repoRoot, file)} has results schema ${results.schema}, and the page reads ${RESULTS_SCHEMA}`
        );
    }
    return { file: path.relative(repoRoot, file).split(path.sep).join('/'), results, summary: summarize(results) };
}

declare const data: BenchmarkPageData | null;
export { data };

export default {
    watch: ['../../../docs/research/benchmarks/*/results.json'],
    load(): BenchmarkPageData | null {
        const page = readNewestBenchmark();
        if (!page)
            console.warn('No server benchmark results under docs/research/benchmarks; run pnpm run bench:servers.');
        return page;
    }
};
