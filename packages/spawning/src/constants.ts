import table from './tables/spawnConstants.json';
import type { PopulationPool } from './rules';

/**
 * Defaults the spawning algorithm reads from one replaceable table.
 *
 * Mojang documents the pool names and spawn-rule component parameters, but
 * Bedrock publishes no spawn attempt rate, cap, sampling radius, or light
 * algorithm. Java's 24-block minimum spawn distance comes from
 * `NaturalSpawner.isRightDistanceToPlayerAndSpawnPoint`. The other values are
 * this project's choices. They live in `src/tables/spawnConstants.json`, and
 * each carries a `source` string that records where it came from.
 */

/** Whether a pool's cap covers the whole spawn region or scales with the players in it. */
export type PoolCapScope = 'per_player' | 'per_region';

/** One pool's cap, cadence and the provenance of both. */
export interface PoolConstants {
    /** The cap, or null for a pool the documentation leaves to other machinery. */
    readonly cap: number | null;
    readonly scope: PoolCapScope;
    /** How many ticks pass between two spawn cycles of this pool. */
    readonly cycleTicks: number;
    /** Where the two numbers came from, quoted so a reader can judge them. */
    readonly source: string;
}

/** The whole constants table. */
export interface SpawnConstants {
    /** Where the table's values came from. */
    readonly provenance: string;
    readonly pools: Readonly<Record<string, PoolConstants>>;
    /** How far from a player, in chunks, the spawner looks for a position. */
    readonly spawnRadiusChunks: number;
    readonly spawnRadiusSource: string;
    /** Minimum natural spawn distance in blocks from players and the world spawn. */
    readonly minimumSpawnDistance?: number;
    /** Where the minimum spawn distance came from. Optional for older custom tables. */
    readonly minimumSpawnDistanceSource?: string;
    /** How many chunks one cycle samples per player. */
    readonly chunksPerCycle: number;
    /** How many positions one cycle tries in each sampled chunk. */
    readonly positionsPerChunk: number;
    readonly attemptSource: string;
    /** How far from the anchor, in blocks, a herd member may be placed. */
    readonly herdRadius: number;
    readonly herdRadiusSource: string;
    /** The radius `minecraft:density_limit` counts entities over. */
    readonly densityRadius: number;
    readonly densityRadiusSource: string;
    /** How much rain lowers the light an `adjust_for_weather` brightness filter compares. */
    readonly rainDarkening: number;
    /** How much a thunderstorm lowers that light. */
    readonly thunderDarkening: number;
    readonly darkeningSource: string;
    /** How far from every player, in chunks, a mob is culled. */
    readonly despawnRadiusChunks: number;
    /** The height at and below which every mob despawns. */
    readonly despawnFloorY: number;
    readonly despawnSource: string;
}

/**
 * The default spawning values, read from `src/tables/spawnConstants.json`. A host replaces the table through
 * `SpawnerOptions.constants`.
 */
// The table is hand-maintained JSON in this package; its literal types are too
// narrow to describe a host's replacement, so the shape is asserted once here.
export const SPAWN_CONSTANTS = table as Required<SpawnConstants>;

/**
 * The cap one pool is allowed in the spawn region right now.
 *
 * @param players - How many players the spawn region holds, which scales a
 * `per_player` cap.
 * @returns The cap, or undefined when the pool has none and other machinery
 * limits it.
 */
export const poolCapFor = (
    pool: PopulationPool | string,
    players: number,
    constants: SpawnConstants = SPAWN_CONSTANTS
): number | undefined => {
    const entry = constants.pools[pool];
    if (entry === undefined || entry.cap === null) return undefined;
    return entry.scope === 'per_player' ? entry.cap * players : entry.cap;
};

/** How many ticks pass between two spawn cycles of one pool. */
export const cycleTicksFor = (
    pool: PopulationPool | string,
    constants: SpawnConstants = SPAWN_CONSTANTS
): number | undefined => constants.pools[pool]?.cycleTicks;
