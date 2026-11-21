import { describe, expect, it } from 'vitest';

import { buildHistory, historyView } from './history.mts';
import { RESULTS_SCHEMA, commitSource, parseCommitSource } from './results.mts';
import { METRICS } from './summary.mts';

import type { BenchmarkResults, RunResult, ServerDescription, ServerId, Transport } from './results.mts';

const MIB = 1024 * 1024;

/** One finished flat-world run whose travel phase delivered 100 chunks for `travelCpuMs`. */
const run = (server: ServerId, travelCpuMs: number, peakRssMiB = 512): RunResult => {
    const phase = {
        wallMs: 10_000,
        cpuMs: travelCpuMs,
        columns: 100,
        columnPackets: 100,
        sections: 100,
        bytesReceived: 100_000,
        stepsTimedOut: 0
    };
    return {
        server,
        scenario: 'flat',
        round: 0,
        position: 0,
        ok: true,
        startedAt: '2026-11-21T00:00:00.000Z',
        load: { before: [0.5, 0.5, 0.5], after: [0.5, 0.5, 0.5] },
        startupMs: 5_000,
        startupCpuMs: 4_000,
        phases: { join: phase, travel: phase, idle: { ...phase, cpuMs: 3_000, wallMs: 30_000 } },
        peakRssBytes: peakRssMiB * MIB,
        idleRssBytes: 256 * MIB,
        processes: 1,
        bots: { requested: 10, joined: 10, grantedRadius: [10], disconnects: [] }
    };
};

const server = (name: string, transport: Transport, source: string, version = '1.0.0'): ServerDescription => ({
    name,
    transport,
    version,
    source,
    command: 'run',
    settings: []
});

interface Fixture {
    readonly startedAt: string;
    readonly cpuModel?: string;
    readonly quiet?: boolean;
    readonly runs: readonly RunResult[];
    readonly bdsTransport?: Transport;
    readonly bdsVersion?: string;
    /** The input fingerprint; each file gets its own unless a test shares one. */
    readonly inputs?: string | null;
    readonly commit?: string;
}

const results = ({
    startedAt,
    cpuModel = 'CPU A',
    quiet = true,
    runs,
    bdsTransport = 'raknet',
    bdsVersion = '1.0.0',
    inputs = startedAt,
    commit = 'abc1234'
}: Fixture) => {
    const file: BenchmarkResults = {
        schema: RESULTS_SCHEMA,
        startedAt,
        finishedAt: startedAt,
        command: 'node tools/server-benchmark/src/run.mts',
        environment: {
            os: 'Ubuntu',
            kernel: '7.0.0',
            arch: 'x64',
            cpuModel,
            logicalCpus: 4,
            memoryBytes: 16 * 1024 ** 3,
            node: 'v26.13.1',
            ci: null
        },
        protocol: { version: 2225, minecraftVersion: '1.26.60' },
        inputs,
        servers: {
            'jsprismarine-nethernet': server('JSPrismarine over NetherNet', 'nethernet', commitSource(commit, false)),
            'jsprismarine-raknet': server('JSPrismarine over RakNet', 'raknet', commitSource(commit, false)),
            pumpkin: server('Pumpkin', 'nethernet', 'pumpkin-X64-Linux from a release'),
            bds: server('Bedrock Dedicated Server', bdsTransport, 'bedrock-server.zip', bdsVersion)
        },
        scenarios: [
            {
                id: 'flat',
                worlds: {},
                bots: 10,
                viewDistance: 10,
                simulationDistance: 10,
                steps: 6,
                stepBlocks: 64,
                teleportY: -60,
                idleMs: 30_000,
                stepTimeoutMs: 60_000
            }
        ],
        quietLoadLimit: 1,
        harness: { cooldownMaxMs: 180_000, settleQuietMs: 3_000, memorySampleMs: 250 },
        rounds: [{ round: 0, order: [], load: { start: [0.5, 0.5, 0.5], end: [0.5, 0.5, 0.5] }, quiet }],
        runs
    };
    return { file: `docs/research/benchmarks/${startedAt.slice(0, 10)}/results.json`, results: file };
};

const chart = (history: ReturnType<typeof buildHistory>, metric: string) =>
    history.charts.find((entry) => entry.scenario === 'flat' && entry.metric === metric);

describe('commitSource', () => {
    it('reads back the commit it wrote, and names none for a release', () => {
        expect(parseCommitSource(commitSource('563a778bcc9e', false))).toEqual({ sha: '563a778bcc9e', dirty: false });
        expect(parseCommitSource(commitSource('563a778bcc9e', true))).toEqual({ sha: '563a778bcc9e', dirty: true });
        expect(parseCommitSource('bedrock-server-1.26.60.6.zip, pinned in sources.json')).toBeNull();
    });
});

describe('historyView', () => {
    it('draws counts as measured, CPU against JSPrismarine, and leaves wall clock and checks out', () => {
        const views = Object.fromEntries(METRICS.map((metric) => [metric.id, historyView(metric)]));
        expect(views.peakRssMiB).toBe('absolute');
        expect(views.columnsPerCpuSecond).toBe('ratio');
        expect(views.startupSeconds).toBeNull();
        expect(views.columns).toBeNull();
    });
});

describe('buildHistory', () => {
    it('lists runs oldest first whatever order the files come in, with the commit each measured', () => {
        const history = buildHistory([
            results({ startedAt: '2026-11-23T03:00:00.000Z', runs: [run('jsprismarine-nethernet', 1_000)] }),
            results({ startedAt: '2026-11-21T03:00:00.000Z', runs: [run('jsprismarine-nethernet', 1_000)] }),
            results({ startedAt: '2026-11-22T03:00:00.000Z', runs: [run('jsprismarine-nethernet', 1_000)] })
        ]);
        expect(history.runs.map((entry) => entry.startedAt.slice(0, 10))).toEqual([
            '2026-11-21',
            '2026-11-22',
            '2026-11-23'
        ]);
        expect(history.runs[0]!.commit).toBe('abc1234');
        expect(chart(history, 'peakRssMiB')!.series[0]!.points.map((point) => point.run)).toEqual([0, 1, 2]);
    });

    it('lists a run that was not quiet but draws no point from it', () => {
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', runs: [run('jsprismarine-nethernet', 1_000, 500)] }),
            results({
                startedAt: '2026-11-22T03:00:00.000Z',
                quiet: false,
                runs: [run('jsprismarine-nethernet', 1_000, 900)]
            }),
            results({ startedAt: '2026-11-23T03:00:00.000Z', runs: [run('jsprismarine-nethernet', 1_000, 520)] })
        ]);
        expect(history.runs.map((entry) => entry.quiet)).toEqual([true, false, true]);
        expect(chart(history, 'peakRssMiB')!.series[0]!.points).toEqual([
            { run: 0, value: 500, referenceChanged: false },
            { run: 2, value: 520, referenceChanged: false }
        ]);
    });

    it('marks a CPU model change against the quiet run drawn before it', () => {
        const history = buildHistory([
            results({
                startedAt: '2026-11-21T03:00:00.000Z',
                cpuModel: 'CPU A',
                runs: [run('jsprismarine-nethernet', 1_000)]
            }),
            results({
                startedAt: '2026-11-22T03:00:00.000Z',
                cpuModel: 'CPU B',
                quiet: false,
                runs: [run('jsprismarine-nethernet', 1_000)]
            }),
            results({
                startedAt: '2026-11-23T03:00:00.000Z',
                cpuModel: 'CPU A',
                runs: [run('jsprismarine-nethernet', 1_000)]
            }),
            results({
                startedAt: '2026-11-24T03:00:00.000Z',
                cpuModel: 'CPU B',
                runs: [run('jsprismarine-nethernet', 1_000)]
            }),
            results({
                startedAt: '2026-11-25T03:00:00.000Z',
                cpuModel: 'CPU B',
                runs: [run('jsprismarine-nethernet', 1_000)]
            })
        ]);
        expect(history.runs.map((entry) => entry.cpuChanged)).toEqual([false, false, false, true, false]);
    });

    it('divides JSPrismarine by the pinned server over the same transport in the same run', () => {
        // Chunks per CPU second: 100 for JSPrismarine over NetherNet, 50 over RakNet, 200 for
        // Pumpkin and 25 for Bedrock Dedicated Server.
        const history = buildHistory([
            results({
                startedAt: '2026-11-21T03:00:00.000Z',
                runs: [
                    run('jsprismarine-nethernet', 1_000),
                    run('jsprismarine-raknet', 2_000),
                    run('pumpkin', 500),
                    run('bds', 4_000)
                ]
            })
        ]);
        const series = chart(history, 'columnsPerCpuSecond')!.series;
        expect(series.map(({ server, reference, points }) => [server, reference, points[0]!.value])).toEqual([
            ['jsprismarine-nethernet', 'pumpkin', 0.5],
            ['jsprismarine-raknet', 'bds', 2]
        ]);
    });

    it('keeps the ratio steady when a slower runner slows every server alike', () => {
        const history = buildHistory([
            results({
                startedAt: '2026-11-21T03:00:00.000Z',
                cpuModel: 'CPU A',
                runs: [run('jsprismarine-nethernet', 1_000), run('pumpkin', 500)]
            }),
            results({
                startedAt: '2026-11-22T03:00:00.000Z',
                cpuModel: 'CPU B',
                runs: [run('jsprismarine-nethernet', 3_000), run('pumpkin', 1_500)]
            })
        ]);
        const points = chart(history, 'columnsPerCpuSecond')!.series[0]!.points;
        expect(points.map((point) => point.value)).toEqual([0.5, 0.5]);
        expect(history.runs[1]!.cpuChanged).toBe(true);
    });

    it('marks a point whose reference server changed version', () => {
        const runs = [run('jsprismarine-raknet', 2_000), run('bds', 4_000)];
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', runs }),
            results({ startedAt: '2026-11-22T03:00:00.000Z', runs }),
            results({ startedAt: '2026-11-23T03:00:00.000Z', runs, bdsVersion: '1.1.0' })
        ]);
        const points = chart(history, 'columnsPerCpuSecond')!.series[0]!.points;
        expect(points.map((point) => point.referenceChanged)).toEqual([false, false, true]);
    });

    it('starts a new ratio line when a pinned server changes transport', () => {
        const runs = [run('jsprismarine-nethernet', 1_000), run('jsprismarine-raknet', 2_000), run('bds', 4_000)];
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', runs }),
            results({ startedAt: '2026-11-22T03:00:00.000Z', runs, bdsTransport: 'nethernet' })
        ]);
        const bds = chart(history, 'columnsPerCpuSecond')!.series.filter((line) => line.reference === 'bds');
        expect(bds.map((line) => [line.server, line.points.map((point) => [point.run, point.value])])).toEqual([
            ['jsprismarine-raknet', [[0, 2]]],
            ['jsprismarine-nethernet', [[1, 4]]]
        ]);
    });

    it("divides a pinned server's figures into the other JSPrismarine run when its own transport's is missing", () => {
        // CI benchmarks JSPrismarine over NetherNet only; Bedrock Dedicated Server speaks RakNet.
        const history = buildHistory([
            results({
                startedAt: '2026-11-21T03:00:00.000Z',
                runs: [run('jsprismarine-nethernet', 1_000), run('bds', 4_000)]
            })
        ]);
        const bds = chart(history, 'columnsPerCpuSecond')!.series.filter((line) => line.reference === 'bds');
        expect(bds.map((line) => [line.server, line.points.map((point) => [point.run, point.value])])).toEqual([
            ['jsprismarine-nethernet', [[0, 4]]]
        ]);
    });

    it('keeps one run per stretch of runs that measured the same inputs', () => {
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', inputs: 'a', runs: [run('pumpkin', 500, 100)] }),
            results({ startedAt: '2026-11-22T03:00:00.000Z', inputs: 'a', runs: [run('pumpkin', 500, 200)] }),
            results({ startedAt: '2026-11-23T03:00:00.000Z', inputs: 'b', runs: [run('pumpkin', 500, 300)] }),
            results({ startedAt: '2026-11-24T03:00:00.000Z', inputs: 'a', runs: [run('pumpkin', 500, 400)] })
        ]);
        expect(history.runs.map((entry) => [entry.startedAt.slice(0, 10), entry.repeats])).toEqual([
            ['2026-11-21', 1],
            ['2026-11-23', 0],
            ['2026-11-24', 0]
        ]);
        expect(chart(history, 'peakRssMiB')!.series[0]!.points.map((point) => point.value)).toEqual([100, 300, 400]);
    });

    it('keeps the first quiet run of a stretch when the first was not quiet', () => {
        const history = buildHistory([
            results({
                startedAt: '2026-11-21T03:00:00.000Z',
                inputs: 'a',
                quiet: false,
                runs: [run('pumpkin', 500, 100)]
            }),
            results({ startedAt: '2026-11-22T03:00:00.000Z', inputs: 'a', runs: [run('pumpkin', 500, 200)] }),
            results({ startedAt: '2026-11-23T03:00:00.000Z', inputs: 'a', runs: [run('pumpkin', 500, 300)] })
        ]);
        expect(history.runs.map((entry) => [entry.startedAt.slice(0, 10), entry.quiet, entry.repeats])).toEqual([
            ['2026-11-22', true, 2]
        ]);
    });

    it('compares sources when a file has no fingerprint, and never folds uncommitted builds', () => {
        // Written before the fingerprint was recorded, so the file has no `inputs`.
        const unrecorded = (day: number, commit: string) => {
            const file = results({ startedAt: `2026-11-2${day}T03:00:00.000Z`, commit, runs: [] });
            return { ...file, results: { ...file.results, inputs: undefined } };
        };
        expect(
            buildHistory([unrecorded(1, 'abc1234'), unrecorded(2, 'abc1234'), unrecorded(3, 'def5678')]).runs
        ).toHaveLength(2);
        const uncommitted = (day: number) =>
            results({ startedAt: `2026-11-2${day}T03:00:00.000Z`, inputs: null, runs: [] });
        expect(buildHistory([uncommitted(1), uncommitted(2)]).runs).toHaveLength(2);
    });

    it('draws no chart for a metric no quiet run measured', () => {
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', quiet: false, runs: [run('pumpkin', 500)] })
        ]);
        expect(history.charts).toEqual([]);
        expect(history.runs).toHaveLength(1);
    });
});
