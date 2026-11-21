/**
 * Turns the raw runs in `results.json` into the medians and ranges the benchmark page shows.
 *
 * Each metric is computed per run first and summarized across rounds after, so a median is the
 * median of what single runs measured, never a ratio of two medians.
 */
import { SERVER_IDS } from './results.mts';

import type { BenchmarkResults, RunResult, ScenarioId, ServerId, Transport } from './results.mts';

/** The JSPrismarine run over each transport, which every other server over it is compared with. */
export const BASELINE: Readonly<Record<Transport, ServerId>> = {
    nethernet: 'jsprismarine-nethernet',
    raknet: 'jsprismarine-raknet'
};

/** How much a figure depends on the machine's clock and load. */
export type MetricKind =
    /** Counted by the code: bytes and chunks. The same on every machine. */
    | 'count'
    /** CPU time the server's processes used. Steady across runs on one machine, not across machines. */
    | 'cpu'
    /** Elapsed time. Moves with everything else on the machine. */
    | 'wall';

/** One figure the page shows: how to read it off a run, which way is better, and how robust it is. */
export interface MetricDefinition {
    readonly id: string;
    readonly kind: MetricKind;
    readonly better: 'lower' | 'higher';
    /** The value for one run, or null when that run cannot give one. */
    readonly measure: (run: RunResult) => number | null;
}

const MIB = 1024 * 1024;

/**
 * The travel phase is the one whose work is the same on every server: the bots start at the
 * origin and are teleported along the same paths. The join phase also loads each server's own
 * spawn area, which is somewhere else on each, so its chunk counts differ by design.
 *
 * A travel phase with a step that ran out of time did less than the workload asks, so it gives no
 * travel figures; {@link CellSummary.travelTimeouts} counts those runs.
 */
const travel = (run: RunResult) => {
    const phase = run.phases?.travel;
    return phase === undefined || phase.stepsTimedOut > 0 ? null : phase;
};

/**
 * Every figure the page shows, in no particular order. A run gives a figure only when it finished
 * and the phase the figure reads is complete; the others are left out of the median.
 */
export const METRICS = [
    {
        id: 'columnsPerCpuSecond',
        kind: 'cpu',
        better: 'higher',
        measure: (run) => {
            const phase = travel(run);
            return phase === null || phase.cpuMs === 0 ? null : phase.columns / (phase.cpuMs / 1000);
        }
    },
    {
        id: 'idleCpuPercent',
        kind: 'cpu',
        better: 'lower',
        measure: (run) =>
            run.phases === null || run.phases.idle.wallMs === 0
                ? null
                : (100 * run.phases.idle.cpuMs) / run.phases.idle.wallMs
    },
    {
        id: 'peakRssMiB',
        kind: 'count',
        better: 'lower',
        measure: (run) => (run.peakRssBytes > 0 ? run.peakRssBytes / MIB : null)
    },
    {
        id: 'idleRssMiB',
        kind: 'count',
        better: 'lower',
        measure: (run) => (run.idleRssBytes > 0 ? run.idleRssBytes / MIB : null)
    },
    {
        id: 'bytesPerColumn',
        kind: 'count',
        better: 'lower',
        measure: (run) => {
            const phase = travel(run);
            return phase === null || phase.columns === 0 ? null : phase.bytesReceived / phase.columns;
        }
    },
    { id: 'columns', kind: 'count', better: 'higher', measure: (run) => travel(run)?.columns ?? null },
    {
        id: 'startupCpuSeconds',
        kind: 'cpu',
        better: 'lower',
        measure: (run) => (run.startupCpuMs === null ? null : run.startupCpuMs / 1000)
    },
    {
        id: 'startupSeconds',
        kind: 'wall',
        better: 'lower',
        measure: (run) => (run.startupMs === null ? null : run.startupMs / 1000)
    },
    {
        id: 'travelSeconds',
        kind: 'wall',
        better: 'lower',
        measure: (run) => {
            const phase = travel(run);
            return phase === null ? null : phase.wallMs / 1000;
        }
    }
] as const satisfies readonly MetricDefinition[];

/** The id of one of {@link METRICS}. */
export type MetricId = (typeof METRICS)[number]['id'];

/** A metric across the rounds of one server and scenario. */
export interface MetricSummary {
    /** Runs that gave a value. */
    readonly n: number;
    readonly median: number | null;
    readonly min: number | null;
    readonly max: number | null;
    /** Every run's value, in round order. */
    readonly values: readonly number[];
}

/** One server in one scenario: every metric across the rounds, and the runs that gave none. */
export interface CellSummary {
    readonly server: ServerId;
    readonly scenario: ScenarioId;
    /** Runs that finished. */
    readonly ok: number;
    /** Runs that failed, with their errors. */
    readonly failures: readonly string[];
    /** Finished runs left out of the travel figures because a travel step ran out of time. */
    readonly travelTimeouts: number;
    readonly metrics: Readonly<Record<MetricId, MetricSummary>>;
}

/** Everything the page shows from one results file. */
export interface ResultsSummary {
    /** Rounds with a recorded start and end load. */
    readonly rounds: number;
    readonly quietRounds: number;
    /**
     * Every round that has runs was recorded and quiet, so the figures may be read as more than
     * indicative. A file whose last round stopped before its end load was recorded is not quiet.
     */
    readonly quiet: boolean;
    readonly cells: readonly CellSummary[];
}

/** The median, by averaging the middle pair of an even count. */
export const median = (values: readonly number[]): number | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const upper = sorted[middle]!;
    return sorted.length % 2 === 0 ? (sorted[middle - 1]! + upper) / 2 : upper;
};

/** Whether a reading is quiet: the one minute load at most the limit. */
export const isQuietLoad = (oneMinute: number, limit: number): boolean => oneMinute <= limit;

/**
 * The one minute load a quiet reading may show: a quarter of the logical CPUs, and at least 1,
 * the criterion `packages/worldgen/benchmarks/run.mts` uses.
 */
export const quietLoadLimit = (logicalCpus: number): number => Math.max(1, logicalCpus / 4);

const summarizeMetric = (runs: readonly RunResult[], measure: (run: RunResult) => number | null): MetricSummary => {
    const values = runs.map(measure).filter((value): value is number => value !== null && Number.isFinite(value));
    return {
        n: values.length,
        median: median(values),
        min: values.length === 0 ? null : Math.min(...values),
        max: values.length === 0 ? null : Math.max(...values),
        values
    };
};

/** Medians and ranges for every server and scenario that ran, in the order the results list them. */
export const summarize = (results: BenchmarkResults): ResultsSummary => {
    const cells: CellSummary[] = [];
    for (const scenario of results.scenarios) {
        for (const server of SERVER_IDS) {
            const runs = results.runs.filter((run) => run.scenario === scenario.id && run.server === server);
            if (runs.length === 0) continue;
            const finished = runs.filter((run) => run.ok);
            // `Object.fromEntries` types its keys as `string`; the entries come from `METRICS`, one per id.
            const metrics = Object.fromEntries(
                METRICS.map((metric): [MetricId, MetricSummary] => [
                    metric.id,
                    summarizeMetric(finished, metric.measure)
                ])
            ) as Record<MetricId, MetricSummary>;
            cells.push({
                server,
                scenario: scenario.id,
                ok: finished.length,
                failures: runs.filter((run) => !run.ok).map((run) => run.error ?? 'failed'),
                travelTimeouts: finished.filter((run) => (run.phases?.travel.stepsTimedOut ?? 0) > 0).length,
                metrics
            });
        }
    }
    const quietRounds = results.rounds.filter((round) => round.quiet).length;
    const recorded = new Map(results.rounds.map((round) => [round.round, round.quiet]));
    const measured = new Set(results.runs.map((run) => run.round));
    return {
        rounds: results.rounds.length,
        quietRounds,
        quiet:
            measured.size > 0 &&
            quietRounds === results.rounds.length &&
            [...measured].every((round) => recorded.get(round) === true),
        cells
    };
};
