import { describe, expect, it } from 'vitest';
import {
    BOT_FLEET_MAX_REGRESSION_PERCENT,
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
