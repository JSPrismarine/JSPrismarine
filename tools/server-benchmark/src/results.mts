/**
 * The shape of `results.json`, which the benchmark writes and the docs site's benchmark page reads.
 *
 * Every figure in it is raw: one entry per server per scenario per round, with the load averages
 * and the command beside it. Medians and ranges are computed from it where they are shown, by
 * `summary.mts`, so the file never holds a number that was derived and could drift from its inputs.
 */

/** Bumped when a field changes meaning, so the page can refuse a file it would misread. */
export const RESULTS_SCHEMA = 1;

/**
 * The servers a benchmark runs. JSPrismarine runs twice, once over each transport, because the
 * other two do not share one: Pumpkin accepts NetherNet only, and Bedrock Dedicated Server runs
 * over RakNet here. Each of them is compared with JSPrismarine over its own transport.
 */
export const SERVER_IDS = ['jsprismarine-nethernet', 'jsprismarine-raknet', 'pumpkin', 'bds'] as const;
/** One of {@link SERVER_IDS}: a server, and for JSPrismarine the transport its bots joined over. */
export type ServerId = (typeof SERVER_IDS)[number];

/** The Bedrock transports the bots can join over: NetherNet (WebRTC) and RakNet (UDP). */
export const TRANSPORTS = ['nethernet', 'raknet'] as const;
/** One of {@link TRANSPORTS}. */
export type Transport = (typeof TRANSPORTS)[number];

/**
 * The worlds a benchmark measures: `flat`, a flat world, which leaves terrain generation out, and
 * `terrain`, each server's default generator.
 */
export const SCENARIO_IDS = ['flat', 'terrain'] as const;
/** One of {@link SCENARIO_IDS}. */
export type ScenarioId = (typeof SCENARIO_IDS)[number];

/** `os.loadavg()`: the one, five and fifteen minute load averages. */
export type LoadAverages = readonly [number, number, number];

/** What the bots received and what the server's processes spent during one phase of a run. */
export interface PhaseMeasurement {
    /** Wall clock the phase took. Indicative only. */
    readonly wallMs: number;
    /** User plus system CPU time of the server's whole process tree, in milliseconds. */
    readonly cpuMs: number;
    /** Distinct chunk columns the bots received, counted per bot. */
    readonly columns: number;
    /** `LevelChunkPacket`s the bots received, including columns a server sent again. */
    readonly columnPackets: number;
    /** Sub chunks with terrain the bots received, inline in a column or in a `SubChunkPacket`. */
    readonly sections: number;
    /** Bytes the bots' transports received. */
    readonly bytesReceived: number;
    /** Steps that ran out of time before the bots' views settled. */
    readonly stepsTimedOut: number;
}

/** One server, one scenario, one round. */
export interface RunResult {
    readonly server: ServerId;
    readonly scenario: ScenarioId;
    readonly round: number;
    /** Position of this server in the round's order, from 0. */
    readonly position: number;
    /** False when the server failed to start, a bot failed to join, or a phase threw. */
    readonly ok: boolean;
    readonly error?: string;
    readonly startedAt: string;
    /** Load averages just before the server started and just after it exited. */
    readonly load: { readonly before: LoadAverages; readonly after: LoadAverages };
    /** From starting the process to the first bot standing in the world. Indicative only. */
    readonly startupMs: number | null;
    /** CPU the server's process tree used from starting until the first bot joined. */
    readonly startupCpuMs: number | null;
    readonly phases: {
        readonly join: PhaseMeasurement;
        readonly travel: PhaseMeasurement;
        readonly idle: PhaseMeasurement;
    } | null;
    /** The largest resident memory of the whole process tree seen during the run, sampled four times a second. */
    readonly peakRssBytes: number;
    /** Resident memory of the process tree at the end of the idle phase. */
    readonly idleRssBytes: number;
    /** The most processes the server's tree held at once. */
    readonly processes: number;
    readonly bots: {
        readonly requested: number;
        readonly joined: number;
        /** Every chunk radius the server granted in `ChunkRadiusUpdated`, deduplicated. */
        readonly grantedRadius: readonly number[];
        /** Why bots left before the run ended, one entry per bot that did. */
        readonly disconnects: readonly string[];
    };
}

/** A setting a run changed from the server's shipped default, and why. */
export interface SettingChange {
    readonly key: string;
    readonly value: string;
    readonly default: string;
    readonly reason: string;
    /** The scenarios the change applied to. Absent in files written before it was recorded. */
    readonly scenarios?: readonly ScenarioId[];
}

/** One server's build, the command that started it, and every setting the harness changed on it. */
export interface ServerDescription {
    readonly name: string;
    /** The transport the bots joined this server over. */
    readonly transport: Transport;
    readonly version: string;
    /** Where the build came from: a commit, a release asset and its checksum, or a pinned archive. */
    readonly source: string;
    readonly command: string;
    readonly settings: readonly SettingChange[];
}

/** One scenario's world on each server and the workload every server got in it. */
export interface ScenarioDescription {
    readonly id: ScenarioId;
    /** The world each server generates, in its own words. */
    readonly worlds: Readonly<Partial<Record<ServerId, string>>>;
    readonly bots: number;
    readonly viewDistance: number;
    readonly simulationDistance: number;
    readonly steps: number;
    readonly stepBlocks: number;
    readonly teleportY: number;
    readonly idleMs: number;
    /** How long a step may wait for the bots' views to settle. */
    readonly stepTimeoutMs: number;
}

/** One round: the order the servers ran in, and the load at its start and end. */
export interface RoundResult {
    readonly round: number;
    readonly order: readonly ServerId[];
    readonly load: { readonly start: LoadAverages; readonly end: LoadAverages };
    /** One minute load at most {@link BenchmarkResults.quietLoadLimit} at both ends. */
    readonly quiet: boolean;
}

/** A whole `results.json`: the host, the versions, the workload, every round and every run. */
export interface BenchmarkResults {
    readonly schema: typeof RESULTS_SCHEMA;
    readonly startedAt: string;
    readonly finishedAt: string;
    /** The command line that produced this file. */
    readonly command: string;
    readonly environment: {
        readonly os: string;
        readonly kernel: string;
        readonly arch: string;
        readonly cpuModel: string;
        readonly logicalCpus: number;
        readonly memoryBytes: number;
        readonly node: string;
        /** The GitHub Actions run that produced the file, when one did. */
        readonly ci: { readonly runUrl: string; readonly runner: string } | null;
    };
    readonly protocol: { readonly version: number; readonly minecraftVersion: string };
    /** The servers this file measured; a run on a host without one of them leaves it out. */
    readonly servers: Readonly<Partial<Record<ServerId, ServerDescription>>>;
    readonly scenarios: readonly ScenarioDescription[];
    /** The one minute load a round may show at either end and still count as quiet. */
    readonly quietLoadLimit: number;
    readonly harness: {
        /** The longest wait before a run for the one minute load to fall to {@link BenchmarkResults.quietLoadLimit}. */
        readonly cooldownMaxMs: number;
        /** How long no terrain may arrive before a step counts as settled. */
        readonly settleQuietMs: number;
        /** How often memory is sampled. */
        readonly memorySampleMs: number;
    };
    readonly rounds: readonly RoundResult[];
    readonly runs: readonly RunResult[];
}

/**
 * Adds one scenario's setting changes to a server's list. A change with the same key and value as
 * one already listed adds the scenario to it; a key set to another value in this scenario gets an
 * entry of its own, so a value that differs between scenarios is kept for each.
 */
export const mergeSettings = (
    known: readonly SettingChange[],
    added: readonly SettingChange[],
    scenario: ScenarioId
): SettingChange[] => {
    const merged = [...known];
    for (const change of added) {
        const index = merged.findIndex((entry) => entry.key === change.key && entry.value === change.value);
        const existing = merged[index];
        if (existing === undefined) merged.push({ ...change, scenarios: [scenario] });
        else if (!existing.scenarios?.includes(scenario)) {
            merged[index] = { ...existing, scenarios: [...(existing.scenarios ?? []), scenario] };
        }
    }
    return merged;
};
