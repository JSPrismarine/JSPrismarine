import type { SpawnConstants } from './constants';
import { SPAWN_CONSTANTS } from './constants';
import type { SpawnPosition, SpawnWorld } from './world';
import { horizontalDistanceSquared } from './world';

/**
 * The population-level despawn rules.
 *
 * `minecraft:despawn` belongs to `@jsprismarine/entities`, which carries the
 * documented per-entity policy: `despawn_from_distance`,
 * `despawn_from_chance`, `despawn_from_inactivity` and the component's
 * `filters`. Two rules sit outside any entity definition and belong here with
 * the rest of the population machinery: the height every mob despawns below,
 * and the edge of the simulated region.
 */

/** Why one entity despawned. */
export type DespawnReason = 'below_floor' | 'simulation_edge';

/** One entity the population cull looks at. */
export interface DespawnCandidate {
    readonly position: SpawnPosition;
    /** Whether `minecraft:persistent` or a name tag keeps the entity loaded. */
    readonly persistent?: boolean;
}

/**
 * Decides whether one entity leaves the world for a population reason.
 *
 * The Y floor is published and is the same in both editions: every mob
 * despawns at Y=-128 and below. The simulation edge is not published; this
 * project uses `despawnRadiusChunks` on the X and Z axes, whose default of 8
 * chunks is the 128 blocks of
 * `minecraft:despawn.despawn_from_distance.max_distance`.
 *
 * @returns The reason, or undefined when the entity stays.
 */
export const despawnReason = (
    candidate: DespawnCandidate,
    world: SpawnWorld,
    constants: SpawnConstants = SPAWN_CONSTANTS
): DespawnReason | undefined => {
    if (candidate.persistent === true) return undefined;
    if (candidate.position.y <= constants.despawnFloorY) return 'below_floor';

    const edge = constants.despawnRadiusChunks * 16;
    const inRange = world
        .players()
        .some((player) => horizontalDistanceSquared(player.position, candidate.position) <= edge * edge);
    return inRange ? undefined : 'simulation_edge';
};
