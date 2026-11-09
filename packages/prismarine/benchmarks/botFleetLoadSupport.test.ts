import { describe, expect, it } from 'vitest';
import type { GenerationTaskStats } from '@jsprismarine/chunkgen';
import {
    BOT_FLEET_MAX_REGRESSION_PERCENT,
    chunksPerCpuSecond,
    labelCostPerChunk,
    preloadTickCost,
    subtractLabelStats,
    type PreloadArm,
    botFleetWorkloadDigest,
    compareBotFleetBaseline,
    type BotFleetBaseline,
    type BotFleetLoadReport
} from './botFleetLoadSupport';

const report = (workloadDigest = botFleetWorkloadDigest('flat')): BotFleetLoadReport => ({
    benchmark: 'prismarine-bot-fleet',
    terrain: 'flat',
    workloadDigest,
    environment: { arch: 'arm64', nodeMajor: 26, platform: 'darwin', cpuModel: 'Apple M1' },
    phases: [
        { name: 'join', ticks: 400, cpuUsPerTick: 20_000 },
        { name: 'steady', ticks: 120, cpuUsPerTick: 12_000 },
        { name: 'crowd', ticks: 400, cpuUsPerTick: 22_000 }
    ]
});

const baseline = (workloadDigest = botFleetWorkloadDigest('flat')): BotFleetBaseline => ({
    version: 1,
    benchmark: 'prismarine-bot-fleet',
    terrain: 'flat',
    workloadDigest,
    environment: { arch: 'arm64', cpuModel: 'Apple M1', nodeMajor: 26, platform: 'darwin' },
    maxRegressionPercent: BOT_FLEET_MAX_REGRESSION_PERCENT,
    cpuUsPerTick: { join: 20_000, steady: 12_000, crowd: 22_000 }
});

describe('bot-fleet load benchmark baseline', () => {
    it('hashes an identical workload manifest consistently and separates terrain variants', () => {
        expect(botFleetWorkloadDigest('flat')).toBe(botFleetWorkloadDigest('flat'));
        expect(botFleetWorkloadDigest('flat')).not.toBe(botFleetWorkloadDigest('real'));
    });

    it('compares CPU per tick only after workload and environment match', () => {
        expect(compareBotFleetBaseline(report(), baseline()).ok).toBe(true);
        expect(compareBotFleetBaseline(report('different-workload'), baseline()).error).toContain(
            'Workload digest mismatch'
        );
    });

    it('fails when a phase exceeds the committed regression allowance', () => {
        const slower = report();
        const comparison = compareBotFleetBaseline(
            { ...slower, phases: [{ ...slower.phases[0]!, cpuUsPerTick: 30_000 }, ...slower.phases.slice(1)] },
            baseline()
        );

        expect(comparison.ok).toBe(false);
        expect(comparison.phases[0]?.regressionPercent).toBe(50);
    });
});

const distribution = (p99: number, mean = p99 / 2) => ({ mean, p50: mean, p99, max: p99 });
const arm = (name: PreloadArm['name'], elapsedP99: number, latenessP99 = 0): PreloadArm => ({
    name,
    ticks: 200,
    tick: {
        ticks: 200,
        elapsedMs: distribution(elapsedP99),
        latenessMs: distribution(latenessP99),
        overrunCauses: { tickHandlersMs: 0, worldUpdatesMs: 0, chunkCompletionsMs: 0, chunkSchedulerMs: 0, other: 0 }
    },
    chunksLoaded: 50,
    pool: [],
    completionLabels: { 'worker-result': { completed: 50, cpuMs: 100 } }
});

const duration = (totalMs: number) => ({ count: 1, totalMs, maxMs: totalMs, buckets: [] });
const poolEntry = (cpuMs: number): GenerationTaskStats => ({
    status: 'full',
    priority: 'idle',
    tasks: 1,
    failed: 0,
    backlogWait: duration(0),
    turnaround: duration(cpuMs),
    workerWall: duration(cpuMs),
    workerCpu: duration(cpuMs)
});

describe('preload arms', () => {
    it('reads generation tick cost as the full arm minus the idle arm', () => {
        const cost = preloadTickCost(arm('idle', 30, 2), arm('full', 30.4, 5));
        expect(cost.p99ElapsedMs).toBeCloseTo(0.4);
        expect(cost.p99LatenessMs).toBeCloseTo(3);
        expect(cost.underTarget).toBe(true);
        expect(preloadTickCost(arm('idle', 30), arm('full', 35)).underTarget).toBe(false);
    });

    it('divides chunks by summed worker CPU seconds, and says nothing without any', () => {
        expect(chunksPerCpuSecond(10, [poolEntry(1000), poolEntry(1000)])).toBeCloseTo(5);
        expect(chunksPerCpuSecond(10, [])).toBeUndefined();
    });

    it('averages label cost per chunk and subtracts snapshots', () => {
        expect(labelCostPerChunk(arm('full', 1))).toEqual({ 'worker-result': 2 });
        expect(
            subtractLabelStats(
                { a: { completed: 5, cpuMs: 10 }, b: { completed: 2, cpuMs: 4 } },
                { a: { completed: 5, cpuMs: 10 }, b: { completed: 1, cpuMs: 1 } }
            )
        ).toEqual({ b: { completed: 1, cpuMs: 3 } });
    });
});
