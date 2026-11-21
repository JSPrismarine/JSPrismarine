import { describe, expect, it } from 'vitest';

import { RESULTS_SCHEMA } from './results.mts';
import { median, quietLoadLimit, summarize } from './summary.mts';

import type { BenchmarkResults, PhaseMeasurement, RunResult } from './results.mts';

const phase = (overrides: Partial<PhaseMeasurement> = {}): PhaseMeasurement => ({
    wallMs: 10_000,
    cpuMs: 1_000,
    columns: 100,
    columnPackets: 100,
    sections: 100,
    bytesReceived: 100_000,
    stepsTimedOut: 0,
    ...overrides
});

const run = (round: number, travel: Partial<PhaseMeasurement>, overrides: Partial<RunResult> = {}): RunResult => ({
    server: 'jsprismarine-nethernet',
    scenario: 'flat',
    round,
    position: 0,
    ok: true,
    startedAt: '2026-11-21T00:00:00.000Z',
    load: { before: [0.5, 0.5, 0.5], after: [1.5, 0.7, 0.6] },
    startupMs: 5_000,
    startupCpuMs: 4_000,
    phases: { join: phase({ columns: 900 }), travel: phase(travel), idle: phase({ cpuMs: 3_000, wallMs: 30_000 }) },
    peakRssBytes: 512 * 1024 * 1024,
    idleRssBytes: 256 * 1024 * 1024,
    processes: 2,
    bots: { requested: 10, joined: 10, grantedRadius: [10], disconnects: [] },
    ...overrides
});

const results = (runs: RunResult[], quiet: boolean[]): BenchmarkResults => ({
    schema: RESULTS_SCHEMA,
    startedAt: '2026-11-21T00:00:00.000Z',
    finishedAt: '2026-11-21T01:00:00.000Z',
    command: 'node tools/server-benchmark/src/run.mts',
    environment: {
        os: 'Ubuntu 24.04',
        kernel: '6.8.0',
        arch: 'x64',
        cpuModel: 'test',
        logicalCpus: 4,
        memoryBytes: 16 * 1024 ** 3,
        node: 'v26.12.1',
        ci: null
    },
    protocol: { version: 2225, minecraftVersion: '1.26.60' },
    servers: {
        'jsprismarine-nethernet': {
            name: 'JSPrismarine over NetherNet',
            transport: 'nethernet',
            version: '0.22.0',
            source: 'commit',
            command: 'node',
            settings: []
        }
    },
    scenarios: [
        {
            id: 'flat',
            worlds: { 'jsprismarine-nethernet': 'flat' },
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
    rounds: quiet.map((isQuiet, round) => ({
        round,
        order: ['jsprismarine-nethernet'],
        load: { start: [0.5, 0.5, 0.5], end: [0.5, 0.5, 0.5] },
        quiet: isQuiet
    })),
    runs
});

describe('median', () => {
    it('takes the middle value, or the mean of the middle two', () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 3, 2])).toBe(2.5);
        expect(median([])).toBeNull();
    });
});

describe('quietLoadLimit', () => {
    it('is a quarter of the logical CPUs and never under 1', () => {
        expect(quietLoadLimit(16)).toBe(4);
        expect(quietLoadLimit(2)).toBe(1);
    });
});

describe('summarize', () => {
    it('takes each metric per run before the median, so a median is never a ratio of medians', () => {
        const summary = summarize(
            results(
                [
                    run(0, { columns: 100, cpuMs: 1_000 }),
                    run(1, { columns: 300, cpuMs: 2_000 }),
                    run(2, { columns: 100, cpuMs: 4_000 })
                ],
                [true, true, true]
            )
        );
        const perSecond = summary.cells[0]!.metrics.columnsPerCpuSecond;
        expect(perSecond.values).toEqual([100, 150, 25]);
        expect(perSecond.median).toBe(100);
        expect(perSecond.min).toBe(25);
        expect(perSecond.max).toBe(150);
    });

    it('leaves failed runs out of the figures and lists why they failed', () => {
        const summary = summarize(
            results(
                [
                    run(0, {}),
                    run(1, {}, { ok: false, error: 'the server exited with 1 before it was ready', phases: null })
                ],
                [true, true]
            )
        );
        const cell = summary.cells[0]!;
        expect(cell.ok).toBe(1);
        expect(cell.failures).toEqual(['the server exited with 1 before it was ready']);
        expect(cell.metrics.idleCpuPercent.n).toBe(1);
    });

    it('leaves a travel phase with a timed-out step out of the travel figures', () => {
        const summary = summarize(
            results([run(0, { columns: 100 }), run(1, { columns: 50, stepsTimedOut: 1 })], [true, true])
        );
        const cell = summary.cells[0]!;
        expect(cell.metrics.columns.values).toEqual([100]);
        expect(cell.travelTimeouts).toBe(1);
        expect(cell.metrics.idleCpuPercent.n).toBe(2);
    });

    it('is not quiet when a round with runs has no recorded end', () => {
        expect(summarize(results([run(0, {}), run(1, {})], [true])).quiet).toBe(false);
    });

    it('calls a benchmark quiet only when every round was', () => {
        expect(summarize(results([run(0, {})], [true, true])).quiet).toBe(true);
        const mixed = summarize(results([run(0, {})], [true, false]));
        expect(mixed.quiet).toBe(false);
        expect(mixed.quietRounds).toBe(1);
    });
});
