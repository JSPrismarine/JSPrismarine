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

const server = (name: string, transport: Transport, source: string): ServerDescription => ({
    name,
    transport,
    version: '1.0.0',
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
}

const results = ({ startedAt, cpuModel = 'CPU A', quiet = true, runs, bdsTransport = 'raknet' }: Fixture) => {
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
        servers: {
            'jsprismarine-nethernet': server(
                'JSPrismarine over NetherNet',
                'nethernet',
                commitSource('abc1234', false)
            ),
            'jsprismarine-raknet': server('JSPrismarine over RakNet', 'raknet', commitSource('abc1234', false)),
            pumpkin: server('Pumpkin', 'nethernet', 'pumpkin-X64-Linux from a release'),
            bds: server('Bedrock Dedicated Server', bdsTransport, 'bedrock-server.zip')
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
            { run: 0, value: 500 },
            { run: 2, value: 520 }
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

    it('divides CPU figures by JSPrismarine over the same transport in the same run', () => {
        // Chunks per CPU second: 100 chunks over 1 s for JSPrismarine, 0.5 s for Pumpkin, 4 s for BDS.
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
        expect(series.map(({ server, baseline }) => [server, baseline])).toEqual([
            ['pumpkin', 'jsprismarine-nethernet'],
            ['bds', 'jsprismarine-raknet']
        ]);
        expect(series[0]!.points[0]!.value).toBe(2);
        expect(series[1]!.points[0]!.value).toBe(0.5);
    });

    it('keeps a ratio that cancels the machine steady when every server slows alike', () => {
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
        expect(chart(history, 'columnsPerCpuSecond')!.series[0]!.points.map((point) => point.value)).toEqual([2, 2]);
        expect(history.runs[1]!.cpuChanged).toBe(true);
    });

    it('starts a new ratio line when a server changes transport', () => {
        const runs = [run('jsprismarine-nethernet', 1_000), run('jsprismarine-raknet', 2_000), run('bds', 4_000)];
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', runs }),
            results({ startedAt: '2026-11-22T03:00:00.000Z', runs, bdsTransport: 'nethernet' })
        ]);
        const bds = chart(history, 'columnsPerCpuSecond')!.series.filter((line) => line.server === 'bds');
        expect(bds.map((line) => [line.baseline, line.points])).toEqual([
            ['jsprismarine-raknet', [{ run: 0, value: 0.5 }]],
            ['jsprismarine-nethernet', [{ run: 1, value: 0.25 }]]
        ]);
    });

    it('draws no chart for a metric no quiet run measured', () => {
        const history = buildHistory([
            results({ startedAt: '2026-11-21T03:00:00.000Z', quiet: false, runs: [run('pumpkin', 500)] })
        ]);
        expect(history.charts).toEqual([]);
        expect(history.runs).toHaveLength(1);
    });
});
