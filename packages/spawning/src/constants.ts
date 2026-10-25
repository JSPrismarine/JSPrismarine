import table from './tables/spawnConstants.json';
import type { PopulationPool } from './rules';

/**
 * The numbers the spawning algorithm needs and Mojang does not publish.
 *
 * Mojang documents the pool names and every spawn rule component's
 * parameters, and publishes no spawn attempt rate, no cap value, no spawn
 * radius and no light algorithm. The only numbers in print are the
 * tilde-hedged "Typical Cap" column of `EntitySpawningDeepDive.md`. Every
 * number here is therefore this project's choice, it lives in
 * `src/tables/spawnConstants.json` rather than in code so it is visible and
 * replaceable, and each one carries a `source` string saying where it came
 * from.
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
    /** Why none of these numbers are Mojang's. */
    readonly provenance: string;
    readonly pools: Readonly<Record<string, PoolConstants>>;
    /** How far from a player, in chunks, the spawner looks for a position. */
    readonly spawnRadiusChunks: number;
    readonly spawnRadiusSource: string;
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

// The table is hand-maintained JSON in this package; its literal types are too
// narrow to describe a host's replacement, so the shape is asserted once here.
export const SPAWN_CONSTANTS = table as SpawnConstants;

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
