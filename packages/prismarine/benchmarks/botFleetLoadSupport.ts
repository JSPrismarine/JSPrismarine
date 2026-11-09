import { createHash } from 'node:crypto';

export type BotFleetTerrain = 'flat' | 'real';

/** Fixed phase lengths and cohort sizes used by both the benchmark and its workload digest. */
export const botFleetPhases = (terrain: BotFleetTerrain) => {
    const joinTicks = terrain === 'real' ? 1200 : 400;
    const crowdTicks = terrain === 'real' ? 120 : 400;
    return [
        { name: 'join', ticks: joinTicks, bots: 24 },
        { name: 'steady', ticks: 120, bots: 0 },
        { name: 'crowd', ticks: crowdTicks, bots: 8 }
    ] as const;
};

/** Gives real-terrain chunk delivery time to finish on a loaded server. */
export const botFleetLoginTimeoutMs = (terrain: BotFleetTerrain): number => (terrain === 'real' ? 90_000 : 20_000);

/** Allows the variance measured across repeated M1 runs while still catching large regressions. */
export const BOT_FLEET_MAX_REGRESSION_PERCENT = 40;

/** Server and Node details used to reject a baseline from another measurement platform. */
export interface BotFleetEnvironment {
    readonly arch: string;
    readonly nodeMajor: number;
    readonly platform: string;
    readonly cpuModel: string;
}

/** Per-phase CPU cost compared with the committed baseline. */
export interface BotFleetPhaseResult {
    readonly name: string;
    readonly ticks: number;
    readonly cpuUsPerTick: number;
}

/** Machine-readable output from one complete seeded bot-fleet run. */
export interface BotFleetLoadReport {
    readonly benchmark: 'prismarine-bot-fleet';
    readonly terrain: BotFleetTerrain;
    readonly workloadDigest: string;
    readonly environment: BotFleetEnvironment;
    readonly phases: readonly BotFleetPhaseResult[];
}

/** Committed comparison values for one terrain and workload digest. */
export interface BotFleetBaseline {
    readonly version: 1;
    readonly benchmark: 'prismarine-bot-fleet';
    readonly terrain: BotFleetTerrain;
    readonly workloadDigest: string;
    readonly environment: Pick<BotFleetEnvironment, 'arch' | 'cpuModel' | 'nodeMajor' | 'platform'>;
    readonly maxRegressionPercent: number;
    readonly cpuUsPerTick: Readonly<Record<string, number>>;
}

/** Per-phase comparisons or the reason a baseline was not eligible for comparison. */
export interface BotFleetComparison {
    readonly ok: boolean;
    readonly error?: string;
    readonly phases: readonly {
        readonly name: string;
        readonly baselineUsPerTick: number;
        readonly currentUsPerTick: number;
        readonly regressionPercent: number;
        readonly limitPercent: number;
        readonly ok: boolean;
    }[];
}

/** Builds the stable manifest hashed to identify every load-affecting input and terrain. */
export const botFleetWorkload = (terrain: BotFleetTerrain) => ({
    benchmark: 'prismarine-bot-fleet',
    version: 1,
    terrain,
    serverSeed: '2727',
    fleetSeed: 2727,
    viewDistance: 1,
    loginTimeoutMs: botFleetLoginTimeoutMs(terrain),
    server: { maxPlayers: 48, viewDistance: 2, preloadRadius: 0, chunkSendBudgetMs: 5, onlineMode: false },
    movement: 'walk',
    rampPerSecond: 16,
    cohorts: [botFleetPhases(terrain)[0].bots, botFleetPhases(terrain)[2].bots],
    phases: botFleetPhases(terrain).map(({ name, ticks, bots }) => ({ name, ticks, bots }))
});

/** Hashes only fixed workload inputs; observed timings and host load cannot change the digest. */
export const botFleetWorkloadDigest = (terrain: BotFleetTerrain): string =>
    createHash('sha256')
        .update(JSON.stringify(botFleetWorkload(terrain)))
        .digest('hex');

/** Compares a run with its committed baseline and gates CPU only when the workload digest matches. */
export const compareBotFleetBaseline = (report: BotFleetLoadReport, baseline: BotFleetBaseline): BotFleetComparison => {
    if (baseline.version !== 1 || baseline.benchmark !== report.benchmark) {
        return { ok: false, error: 'Baseline version or benchmark name does not match this report', phases: [] };
    }
    if (baseline.terrain !== report.terrain) {
        return {
            ok: false,
            error: `Baseline terrain ${baseline.terrain} does not match ${report.terrain}`,
            phases: []
        };
    }
    if (baseline.workloadDigest !== report.workloadDigest) {
        return {
            ok: false,
            error: `Workload digest mismatch: baseline ${baseline.workloadDigest}, current ${report.workloadDigest}`,
            phases: []
        };
    }
    // Keep CPU model as audit metadata: the committed M1 Pro baseline runs on the hosted M1 SKU.
    if (
        baseline.environment.platform !== report.environment.platform ||
        baseline.environment.arch !== report.environment.arch ||
        baseline.environment.nodeMajor !== report.environment.nodeMajor
    ) {
        return {
            ok: false,
            error: 'Baseline platform, architecture, or Node major version does not match this run',
            phases: []
        };
    }
    if (!Number.isFinite(baseline.maxRegressionPercent) || baseline.maxRegressionPercent < 0) {
        return { ok: false, error: 'Baseline maxRegressionPercent must be a non-negative number', phases: [] };
    }

    const phases = report.phases.map(({ name, cpuUsPerTick }) => {
        const baselineUsPerTick = baseline.cpuUsPerTick[name];
        if (baselineUsPerTick === undefined || !Number.isFinite(baselineUsPerTick) || baselineUsPerTick <= 0) {
            return {
                name,
                baselineUsPerTick: 0,
                currentUsPerTick: cpuUsPerTick,
                regressionPercent: Number.POSITIVE_INFINITY,
                limitPercent: baseline.maxRegressionPercent,
                ok: false
            };
        }

        const regressionPercent = ((cpuUsPerTick - baselineUsPerTick) / baselineUsPerTick) * 100;
        return {
            name,
            baselineUsPerTick,
            currentUsPerTick: cpuUsPerTick,
            regressionPercent,
            limitPercent: baseline.maxRegressionPercent,
            ok: regressionPercent <= baseline.maxRegressionPercent
        };
    });

    return { ok: phases.every((phase) => phase.ok), phases };
};
