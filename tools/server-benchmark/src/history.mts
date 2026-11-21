/**
 * Turns every results file into the time series the benchmark page's history draws: one line per
 * server, scenario and metric, one point per change.
 *
 * Figures from different files ran on different machines. GitHub assigns the runner, and its CPU
 * model changes from day to day, so a CPU time from one file says nothing next to one from
 * another. Pumpkin and Bedrock Dedicated Server are pinned builds that ran the same workload on the
 * same runner in the same run, so the history draws JSPrismarine's CPU figures divided by theirs:
 * the machine's speed divides out, and what is left moves when JSPrismarine or a pin changes.
 * Counted figures, which no machine moves, are drawn as measured. Wall clock figures move with the
 * machine's load as well, which no ratio cancels, so the history leaves them out.
 */
import { BASELINE, METRICS, baselinesOf, summarize } from './summary.mts';
import { SCENARIO_IDS, SERVER_IDS, parseCommitSource } from './results.mts';

import type { BenchmarkResults, ScenarioId, ServerId } from './results.mts';
import type { MetricDefinition, MetricId, ResultsSummary } from './summary.mts';

/** How the history draws a metric: as measured, or JSPrismarine's over a pinned server's in the same run. */
export type HistoryView = 'absolute' | 'ratio';

/**
 * How the history draws a metric, or null to leave it out. Counted figures are the same on any
 * machine; CPU time is not, so it is drawn against a pinned server's; wall clock moves with the
 * load too; and a figure that only checks the servers did the same work has no trend to show.
 */
export const historyView = (metric: MetricDefinition): HistoryView | null => {
    if (metric.kind === 'wall' || metric.better === 'neither') return null;
    return metric.kind === 'count' ? 'absolute' : 'ratio';
};

/** One change the history keeps: the first quiet run of a stretch of runs that measured the same inputs. */
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
    /** Later runs that measured the same inputs, folded into this one. */
    readonly repeats: number;
}

/** A median from one run: the run's index in {@link BenchmarkHistory.runs}, and its value. */
export interface HistoryPoint {
    readonly run: number;
    readonly value: number;
    /** The reference server's version differs from the previous point's, so the ratio may step. */
    readonly referenceChanged: boolean;
}

/**
 * One line on a chart. A ratio line divides a JSPrismarine run by one pinned server over the same
 * transport, so a server that moves to another transport starts a new line.
 */
export interface HistorySeries {
    readonly server: ServerId;
    /** The pinned server the values are divided by, or null for an absolute line. */
    readonly reference: ServerId | null;
    readonly points: readonly HistoryPoint[];
}

/** One metric in one scenario across every quiet run. */
export interface HistoryChart {
    readonly scenario: ScenarioId;
    readonly metric: MetricId;
    readonly view: HistoryView;
    readonly series: readonly HistorySeries[];
}

/** Every change, oldest first, and a chart for each metric and scenario with points. */
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

/**
 * What a run measured, so two runs that measured the same thing compare equal. A file written
 * before the input fingerprint was recorded falls back on every server's source, which names
 * JSPrismarine's commit and the other two pins. A build with uncommitted changes matches nothing.
 */
const inputsOf = ({ file, results }: ResultsFile): string => {
    if (results.inputs === null || commitOf(results)?.dirty) return `uncommitted:${file}`;
    if (results.inputs !== undefined) return `inputs:${results.inputs}`;
    return `sources:${SERVER_IDS.map((server) => results.servers[server]?.source ?? '').join('\n')}`;
};

/**
 * Builds the history from results files in any order. Runs are ordered by the time they started,
 * and a stretch of runs that measured the same inputs keeps only its first quiet run, or its first
 * run when none was quiet. A run that was not quiet is listed but gives no point, since load from
 * other work on the runner can move its figures without any server changing.
 */
export const buildHistory = (files: readonly ResultsFile[]): BenchmarkHistory => {
    const sorted = [...files].sort((left, right) => left.results.startedAt.localeCompare(right.results.startedAt));

    const kept: { file: ResultsFile; summary: ResultsSummary; repeats: number }[] = [];
    let stretch: { inputs: string; index: number } | null = null;
    for (const file of sorted) {
        const summary = summarize(file.results);
        const inputs = inputsOf(file);
        const current = stretch?.inputs === inputs ? kept[stretch.index] : undefined;
        if (current === undefined) {
            stretch = { inputs, index: kept.length };
            kept.push({ file, summary, repeats: 0 });
            continue;
        }
        current.repeats += 1;
        if (!current.summary.quiet && summary.quiet) {
            current.file = file;
            current.summary = summary;
        }
    }

    let previousCpu: string | null = null;
    const runs = kept.map(({ file: { file, results }, summary, repeats }): HistoryRun => {
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
            cpuChanged,
            repeats
        };
    });

    const charts: HistoryChart[] = [];
    for (const scenario of SCENARIO_IDS) {
        for (const metric of METRICS) {
            const view = historyView(metric);
            if (view === null) continue;
            const series = new Map<string, { server: ServerId; reference: ServerId | null; points: HistoryPoint[] }>();
            const add = (server: ServerId, reference: ServerId | null, run: number, value: number) => {
                if (!Number.isFinite(value)) return;
                const key = `${server}:${reference}`;
                const line = series.get(key) ?? { server, reference, points: [] };
                const previous = line.points.at(-1);
                const referenceChanged =
                    reference !== null &&
                    previous !== undefined &&
                    runs[previous.run]!.versions[reference] !== runs[run]!.versions[reference];
                line.points.push({ run, value, referenceChanged });
                series.set(key, line);
            };
            kept.forEach(({ file: { results }, summary }, run) => {
                if (!summary.quiet) return;
                const median = (server: ServerId) =>
                    summary.cells.find((cell) => cell.scenario === scenario && cell.server === server)?.metrics[
                        metric.id
                    ].median ?? null;
                for (const server of SERVER_IDS) {
                    const value = median(server);
                    if (value === null) continue;
                    if (view === 'absolute') {
                        add(server, null, run, value);
                        continue;
                    }
                    // A ratio line is JSPrismarine over a pinned server, so each pinned server gives
                    // one, divided into the JSPrismarine run over its own transport.
                    const baseline = baselinesOf(results.servers, server).find(
                        (candidate) => median(candidate) !== null
                    );
                    const ours = baseline === undefined ? null : median(baseline);
                    if (baseline === undefined || ours === null || value === 0) continue;
                    add(baseline, server, run, ours / value);
                }
            });
            if (series.size > 0) charts.push({ scenario, metric: metric.id, view, series: [...series.values()] });
        }
    }
    return { runs, charts };
};
