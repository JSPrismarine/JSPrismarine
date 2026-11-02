/**
 * The monster spawner's cycle, Java's `BaseSpawner.serverTick`, as a pure step over the block
 * entity and what stands around it.
 *
 * The world owns the players, the entities and the blocks, so it answers the four questions a
 * cycle asks through {@link SpawnerSurroundings} and acts on the answer: the mobs to make and
 * the block entity to write back. Nothing here reaches a chunk or a client.
 */
import { Types } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';

import type { MobSpawner } from '../blockentity/BlockEntities';

/** How many rows a spawn may land in: the spawner's own, and one above and one below. */
const SPAWN_ROWS = 3;

/** What a spawner needs to know about the world around it. */
export interface SpawnerSurroundings {
    /** A number in [0, 1), rolled for every spawn offset and the next delay. */
    random(): number;
    /** Whether a player stands within the range of the spawner's center, in blocks. */
    isPlayerWithin(range: number): boolean;
    /** How many of the mob stand in the box the spawner's block grows to when inflated by the range. */
    countNearby(identifier: string, range: number): number;
    /** Whether a mob can stand with its feet in this block: open here and above, ground below. */
    canSpawnAt(x: number, y: number, z: number): boolean;
}

/** Where one spawned mob stands, feet first. */
export interface SpawnerSpawn {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** One spawner tick: the mobs to make, and the block entity as it stands afterward. */
export interface SpawnerTick {
    /** The complete block entity, with its delay advanced or reset. */
    readonly tags: NBTTagCompound;
    /** The mobs the cycle produced, none on a tick that only counted down. */
    readonly spawns: readonly SpawnerSpawn[];
}

/**
 * Java's `delay`: the next wait, drawn between the two bounds, or the lower one when they meet.
 */
const nextDelay = (spawner: MobSpawner, random: () => number): number => {
    const min = spawner.getMinSpawnDelay();
    const max = spawner.getMaxSpawnDelay();
    return max <= min ? min : min + Math.floor(random() * (max - min));
};

/**
 * Advances a spawner by one tick.
 *
 * Nothing happens without a player in range, not even the countdown, as in Java. With one, the
 * delay runs down; at zero the cycle attempts `SpawnCount` positions in a `SpawnRange` square
 * three rows tall, stops early when `MaxNearbyEntities` of the mob already stand there, and
 * resets the delay once anything spawned or the area was full. A cycle that found nowhere to
 * stand tries again next tick, which is why a buried spawner fires the moment it is dug out.
 *
 * @returns The spawns and the written-back tags, or undefined for a spawner that did nothing:
 *   no mob, or nobody near.
 */
export const tickSpawner = (spawner: MobSpawner, around: SpawnerSurroundings): SpawnerTick | undefined => {
    const identifier = spawner.getEntityIdentifier();
    if (identifier === '') return undefined;
    if (!around.isPlayerWithin(spawner.getRequiredPlayerRange())) return undefined;

    const tags = spawner.toNBT();
    const delay = spawner.getDelay();
    if (delay > 0) {
        tags.addValue('Delay', new Types.ShortVal(delay - 1));
        return { tags, spawns: [] };
    }

    const position = spawner.getPosition();
    const range = spawner.getSpawnRange();
    const spawns: SpawnerSpawn[] = [];
    // Counted once and then kept up with what this cycle adds, which is what Java reads back
    // from the world after each spawn lands.
    let nearby = around.countNearby(identifier, range);
    let crowded = false;

    for (let attempt = 0; attempt < spawner.getSpawnCount(); attempt++) {
        if (nearby >= spawner.getMaxNearbyEntities()) {
            crowded = true;
            break;
        }
        const x = position.getX() + (around.random() - around.random()) * range + 0.5;
        const y = position.getY() + Math.floor(around.random() * SPAWN_ROWS) - 1;
        const z = position.getZ() + (around.random() - around.random()) * range + 0.5;
        if (!around.canSpawnAt(Math.floor(x), y, Math.floor(z))) continue;

        spawns.push({ x, y, z });
        nearby += 1;
    }

    if (spawns.length > 0 || crowded) tags.addValue('Delay', new Types.ShortVal(nextDelay(spawner, around.random)));
    return { tags, spawns };
};
