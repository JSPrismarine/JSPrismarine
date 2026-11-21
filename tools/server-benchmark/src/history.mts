/**
 * Turns every results file into the time series the benchmark page's history draws: one line per
 * server, scenario and metric, one point per run.
 *
 * Figures from different files ran on different machines. GitHub assigns the runner, and its CPU
 * model changes from day to day, so a CPU time from one file says nothing next to one from
 * another. The history therefore draws a CPU figure only as a ratio to JSPrismarine's in the same
 * file, which the machine divides out of, and draws counted figures, which no machine moves, as
 * they are. Wall clock figures move with the machine's load as well, and neither cancels it, so
 * the history leaves them out.
 */
import { BASELINE, METRICS, summarize } from './summary.mts';
import { SCENARIO_IDS, SERVER_IDS, parseCommitSource } from './results.mts';

import type { BenchmarkResults, ScenarioId, ServerId } from './results.mts';
import type { MetricDefinition, MetricId } from './summary.mts';

/** How the history draws a metric: as measured, or as a ratio to JSPrismarine in the same run. */
export type HistoryView = 'absolute' | 'ratio';

/**
 * How the history draws a metric, or null to leave it out. Counted figures are the same on any
 * machine; CPU time is not, so it is drawn against JSPrismarine's; wall clock moves with the load
 * too; and a figure that only checks the servers did the same work has no trend to show.
 */
export const historyView = (metric: MetricDefinition): HistoryView | null => {
    if (metric.kind === 'wall' || metric.better === 'neither') return null;
    return metric.kind === 'count' ? 'absolute' : 'ratio';
};

/** One results file, as the history lists it. */
export interface HistoryRun {
    /** The results file, relative to the repository root. */
    readonly file: string;
    readonly startedAt: string;
    /** The JSPrismarine commit the run measured, or null when the file names none. */
    readonly commit: string | null;
    /** The build had changes in `packages/` that {@link commit} does not hold. */
    readonly dirty: boolean;
    readonly cpuModel: string;
    readonly logicalCpus: number;
    /** Every round was quiet; only quiet runs are drawn. */
    readonly quiet: boolean;
    readonly quietRounds: number;
    readonly rounds: number;
    /** Each server's version in this run. */
    readonly versions: Readonly<Partial<Record<ServerId, string>>>;
    /** The GitHub Actions run that produced the file, when one did. */
    readonly runUrl: string | null;
    /** A quiet run whose CPU model differs from the quiet run drawn before it. */
    readonly cpuChanged: boolean;
}

/** A median from one run: the run's index in {@link BenchmarkHistory.runs}, and its value. */
export interface HistoryPoint {
    readonly run: number;
    readonly value: number;
}

/**
 * One server's line on a chart. A ratio line divides by one JSPrismarine run, so a server that
 * moves to another transport starts a new line against the JSPrismarine run over that transport.
 */
export interface HistorySeries {
    readonly server: ServerId;
    /** The JSPrismarine run the values are divided by, or null for an absolute line. */
    readonly baseline: ServerId | null;
    readonly points: readonly HistoryPoint[];
}

/** One metric in one scenario across every quiet run. */
export interface HistoryChart {
    readonly scenario: ScenarioId;
    readonly metric: MetricId;
    readonly view: HistoryView;
    readonly series: readonly HistorySeries[];
}

/** Every results file, oldest first, and a chart for each metric and scenario with points. */
export interface BenchmarkHistory {
    readonly runs: readonly HistoryRun[];
    readonly charts: readonly HistoryChart[];
}

/** A results file and its path, as the docs loader reads it. */
export interface ResultsFile {
    readonly file: string;
    readonly results: BenchmarkResults;
}

/** The JSPrismarine commit a results file measured, from either JSPrismarine run's source. */
const commitOf = (results: BenchmarkResults) => {
    for (const server of Object.values(BASELINE)) {
        const source = results.servers[server]?.source;
        const commit = source === undefined ? null : parseCommitSource(source);
        if (commit !== null) return commit;
    }
    return null;
};

/** The JSPrismarine run a server is divided by: the one over its transport, or null for itself. */
const baselineOf = (results: BenchmarkResults, server: ServerId): ServerId | null => {
    const transport = results.servers[server]?.transport;
    if (transport === undefined) return null;
    const baseline = BASELINE[transport];
    return baseline === server || results.servers[baseline] === undefined ? null : baseline;
};

/**
 * Builds the history from results files in any order. Runs are listed oldest first by the time they
 * started; a run that was not quiet is listed but gives no point, since load from other work on the
 * runner can move its figures without any server changing.
 */
export const buildHistory = (files: readonly ResultsFile[]): BenchmarkHistory => {
    const sorted = [...files].sort((left, right) => left.results.startedAt.localeCompare(right.results.startedAt));
    const summaries = sorted.map(({ results }) => summarize(results));

    let previousCpu: string | null = null;
    const runs = sorted.map(({ file, results }, index): HistoryRun => {
        const summary = summaries[index]!;
        const commit = commitOf(results);
        const cpuModel = results.environment.cpuModel;
        const cpuChanged = summary.quiet && previousCpu !== null && previousCpu !== cpuModel;
        if (summary.quiet) previousCpu = cpuModel;
        return {
            file,
            startedAt: results.startedAt,
            commit: commit?.sha ?? null,
            dirty: commit?.dirty ?? false,
            cpuModel,
            logicalCpus: results.environment.logicalCpus,
            quiet: summary.quiet,
            quietRounds: summary.quietRounds,
            rounds: summary.rounds,
            versions: Object.fromEntries(
                SERVER_IDS.flatMap((server) => {
                    const version = results.servers[server]?.version;
                    return version === undefined ? [] : [[server, version]];
                })
            ),
            runUrl: results.environment.ci?.runUrl ?? null,
            cpuChanged
        };
    });

    const charts: HistoryChart[] = [];
    for (const scenario of SCENARIO_IDS) {
        for (const metric of METRICS) {
            const view = historyView(metric);
            if (view === null) continue;
            const series = new Map<string, { server: ServerId; baseline: ServerId | null; points: HistoryPoint[] }>();
            sorted.forEach(({ results }, run) => {
                if (!runs[run]!.quiet) return;
                const median = (server: ServerId) =>
                    summaries[run]!.cells.find((cell) => cell.scenario === scenario && cell.server === server)?.metrics[
                        metric.id
                    ].median ?? null;
                for (const server of SERVER_IDS) {
                    const ours = median(server);
                    if (ours === null) continue;
                    let baseline: ServerId | null = null;
                    let value = ours;
                    if (view === 'ratio') {
                        baseline = baselineOf(results, server);
                        const theirs = baseline === null ? null : median(baseline);
                        if (theirs === null || theirs === 0) continue;
                        value = ours / theirs;
                    }
                    if (!Number.isFinite(value)) continue;
                    const key = `${server}:${baseline}`;
                    const line = series.get(key) ?? { server, baseline, points: [] };
                    line.points.push({ run, value });
                    series.set(key, line);
                }
            });
            if (series.size > 0) charts.push({ scenario, metric: metric.id, view, series: [...series.values()] });
        }
    }
    return { runs, charts };
};
