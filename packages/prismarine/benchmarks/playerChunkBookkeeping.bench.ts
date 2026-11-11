/**
 * Profiles player coverage synchronization and chunk queue updates for twenty players
 * walking with a view distance of 32 chunks.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:player-chunk-bookkeeping`.
 */
import os from 'node:os';

import type Server from '../src/Server';
import { stub } from '../src/testing/stub.test.helper';
import type { Config } from '../src/config/Config';
import Chunk from '../src/world/chunk/Chunk';
import { World } from '../src/world/World';
import type { Position as PositionType } from '../src/world/Position';
import { sessionFor } from '../src/testing/playerSession.test.helper';
import type ClientConnection from '../src/network/ClientConnection';
import type PlayerSession from '../src/network/PlayerSession';
import type { SessionPlayer } from '../src/network/sessionPlayers';

/** What the world files in its player map: each player's session. */
type WorldPlayer = PlayerSession;

const PLAYER_COUNT = 20;
const VIEW_DISTANCE = 32;
const WARMUP_TICKS = 10;
const MEASURED_TICKS = 100;
const SIMULATION_DISTANCE = 10;
const LIGHT_DISTANCE = 11;

interface Coverage {
    x: number;
    z: number;
    viewDistance: number;
}

type CoverageCounts = [simulation: number, retention: number, light: number];

interface PlayerState extends Coverage {
    id: number;
}

const percentile50 = (measurements: readonly number[]): number => {
    const sorted = [...measurements].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)]!;
};

/** Recreates the previous full-square coverage updates as a benchmark baseline. */
const changeLegacyArea = (
    countsByChunk: Map<number, CoverageCounts>,
    center: Coverage,
    radius: number,
    area: 0 | 1 | 2,
    change: -1 | 1
): void => {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
        for (let z = center.z - radius; z <= center.z + radius; z++) {
            const key = Chunk.packXZ(x, z);
            const counts: CoverageCounts = countsByChunk.get(key) ?? [0, 0, 0];
            counts[area] += change;
            if (counts[0] === 0 && counts[1] === 0 && counts[2] === 0) countsByChunk.delete(key);
            else countsByChunk.set(key, counts);
        }
    }
};

const changeLegacyCoverage = (counts: Map<number, CoverageCounts>, coverage: Coverage, change: -1 | 1): void => {
    changeLegacyArea(counts, coverage, SIMULATION_DISTANCE, 0, change);
    changeLegacyArea(counts, coverage, coverage.viewDistance, 1, change);
    changeLegacyArea(counts, coverage, LIGHT_DISTANCE, 2, change);
};

const sameCoverage = (left: Coverage | undefined, right: Coverage): boolean =>
    left !== undefined && left.x === right.x && left.z === right.z && left.viewDistance === right.viewDistance;

const synchronizeLegacy = (
    previous: Map<number, Coverage>,
    counts: Map<number, CoverageCounts>,
    next: ReadonlyMap<number, Coverage>
): void => {
    for (const [id, coverage] of next) {
        const old = previous.get(id);
        if (sameCoverage(old, coverage)) continue;
        if (old !== undefined) changeLegacyCoverage(counts, old, -1);
        changeLegacyCoverage(counts, coverage, 1);
        previous.set(id, { ...coverage });
    }

    for (const [id, coverage] of previous) {
        if (next.has(id)) continue;
        changeLegacyCoverage(counts, coverage, -1);
        previous.delete(id);
    }
};

const states = new Map<number, PlayerState>();
const players = new Map<number, WorldPlayer>();
const world = Object.assign(Object.create(World.prototype), { players, chunks: new Map() }) as World;

for (let index = 0; index < PLAYER_COUNT; index++) {
    const state = {
        id: index,
        x: (index % 5) * 48,
        z: Math.floor(index / 5) * 48,
        viewDistance: VIEW_DISTANCE
    };
    states.set(state.id, state);
    players.set(
        state.id,
        stub<WorldPlayer>({
            getViewDistance: () => state.viewDistance,
            getViewPosition: () => stub<PositionType>({ getX: () => state.x * 16, getZ: () => state.z * 16 })
        })
    );
}

const currentCoverage = (): Map<number, Coverage> =>
    new Map(Array.from(states, ([id, { x, z, viewDistance }]) => [id, { x, z, viewDistance }]));

const references = world['getPlayerChunkRefCounts']();
references.synchronize(players);
const legacyCounts = new Map<number, CoverageCounts>();
const legacyPlayers = new Map<number, Coverage>();
synchronizeLegacy(legacyPlayers, legacyCounts, currentCoverage());

const coverageLegacySamples: number[] = [];
const coverageIndexedSamples: number[] = [];
const movePlayers = (tick: number): void => {
    for (const state of states.values()) {
        state.x++;
        state.z += state.id % 2 === 0 ? 1 : -1;
    }

    // Read the tick parameter so benchmark setup and measurement use the same movement pattern.
    if (tick < 0) throw new Error('Benchmark ticks must be nonnegative');
};

const synchronizeCoverage = (tick: number, record: boolean): void => {
    const next = currentCoverage();
    const startedLegacy = performance.now();
    synchronizeLegacy(legacyPlayers, legacyCounts, next);
    if (record) coverageLegacySamples.push(performance.now() - startedLegacy);

    const startedIndexed = performance.now();
    references.synchronize(players);
    if (record) coverageIndexedSamples.push(performance.now() - startedIndexed);
    movePlayers(tick);
};

for (let tick = 0; tick < WARMUP_TICKS; tick++) synchronizeCoverage(tick, false);
for (let tick = 0; tick < MEASURED_TICKS; tick++) synchronizeCoverage(tick, true);

let coverageDigest = 2166136261;
const current = currentCoverage();
const minX = Math.min(...Array.from(current.values(), ({ x }) => x - VIEW_DISTANCE));
const maxX = Math.max(...Array.from(current.values(), ({ x }) => x + VIEW_DISTANCE));
const minZ = Math.min(...Array.from(current.values(), ({ z }) => z - VIEW_DISTANCE));
const maxZ = Math.max(...Array.from(current.values(), ({ z }) => z + VIEW_DISTANCE));
for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
        const key = Chunk.packXZ(x, z);
        const indexed = [references.simulates(x, z), references.retains(x, z), references.lights(x, z)];
        const legacy = legacyCounts.get(key) ?? [0, 0, 0];
        const recounted = [legacy[0] > 0, legacy[1] > 0, legacy[2] > 0];
        if (indexed.some((value, index) => value !== recounted[index]))
            throw new Error(`Coverage indexes differ at ${x},${z}`);
        for (const covered of indexed) coverageDigest = Math.imul(coverageDigest ^ Number(covered), 16777619) >>> 0;
    }
}

const config = stub<Config>({
    getProximityBroadcast: () => true,
    getEntityTrackingHysteresis: () => 2
});
const server = stub<Server>({ getConfig: () => config });
const sessions = Array.from(states.values(), (state) => {
    const player = players.get(state.id);
    if (player === undefined) throw new Error('Benchmark player session lost its player');
    // The session reads where its player stands off the store player.
    return sessionFor(
        server,
        stub<ClientConnection>(),
        stub<SessionPlayer>({ getPosition: () => player.getViewPosition() })
    );
});

const queueSamples: number[] = [];
let queueDigest = 2166136261;
const updateQueues = async (tick: number, record: boolean): Promise<void> => {
    for (const state of states.values()) {
        state.x++;
        state.z += state.id % 2 === 0 ? 1 : -1;
    }

    const started = performance.now();
    for (const session of sessions) {
        await session.needNewChunks();
        const next = session.sender.next();
        if (next !== null) {
            queueDigest = Math.imul(queueDigest ^ Chunk.packXZ(next.x, next.z), 16777619) >>> 0;
        }
    }
    if (record) queueSamples.push(performance.now() - started);
    if (tick < 0) throw new Error('Benchmark ticks must be nonnegative');
};

for (let tick = 0; tick < WARMUP_TICKS; tick++) await updateQueues(tick, false);
for (let tick = 0; tick < MEASURED_TICKS; tick++) await updateQueues(tick, true);

console.log(
    JSON.stringify(
        {
            fixture: { players: PLAYER_COUNT, viewDistance: VIEW_DISTANCE, ticks: MEASURED_TICKS },
            host: `${os.cpus()[0]?.model ?? 'unknown'}; Node ${process.versions.node}`,
            coverage: {
                fullSquareRecountP50Microseconds: Math.round(percentile50(coverageLegacySamples) * 1000),
                incrementalStripsP50Microseconds: Math.round(percentile50(coverageIndexedSamples) * 1000),
                digest: coverageDigest.toString(16).padStart(8, '0')
            },
            queue: {
                twentyPlayerUpdateP50Milliseconds: Number(percentile50(queueSamples).toFixed(3)),
                digest: queueDigest.toString(16).padStart(8, '0')
            }
        },
        null,
        2
    )
);
