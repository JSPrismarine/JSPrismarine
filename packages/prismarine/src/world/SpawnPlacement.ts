import { Vector3 } from '@jsprismarine/math';

/**
 * The spawn height that means "the surface, wherever it is".
 *
 * A Bedrock Dedicated Server writes it into a new world's `level.dat` before anybody has
 * joined, and resolves it per player against the column's terrain.
 */
export const UNKNOWN_SPAWN_HEIGHT = 32767;

/**
 * How far, in blocks along each axis, a spawn that lands on leaves is moved.
 *
 * Measured, not documented: across nine relocations by BDS 1.26.52 the offset never went
 * past 15 on either axis.
 */
export const SPAWN_RELOCATION_RANGE = 15;

/** What placing a spawn needs to know about the world. */
export interface SpawnTerrain {
    readonly minY: number;
    readonly maxY: number;
    /** Whether a player's body cannot occupy the block. */
    isObstructed(x: number, y: number, z: number): Promise<boolean>;
    /** The block's state name, such as `minecraft:birch_leaves`. */
    getBlockName(x: number, y: number, z: number): Promise<string>;
    /** The y of the column's highest block that is not air, or null for an empty column. */
    getHighestBlock(x: number, z: number): Promise<number | null>;
}

/** Where a player is put, as feet positions on block centers. */
export interface PlayerSpawn {
    /** Where the spawn point says, before the terrain is consulted. */
    readonly requested: Vector3;
    /** Where the player actually starts. */
    readonly position: Vector3;
    /** Whether the requested spot was rejected and the player moved to another column. */
    readonly relocated: boolean;
}

/** Returns a whole number from `-SPAWN_RELOCATION_RANGE` to `SPAWN_RELOCATION_RANGE`. */
export type RelocationOffset = () => number;

const randomOffset: RelocationOffset = () =>
    Math.floor(Math.random() * (SPAWN_RELOCATION_RANGE * 2 + 1)) - SPAWN_RELOCATION_RANGE;

const AIR = 'minecraft:air';

const isLeaves = (name: string): boolean => name === 'minecraft:leaves' || name.endsWith('_leaves');

const centered = (x: number, y: number, z: number): Vector3 => new Vector3(x + 0.5, y, z + 0.5);

/**
 * Where the spawn point says a player's feet go, before the terrain is consulted: one block
 * above the stored height, centered on the block.
 * @param spawn - the world spawn, in block coordinates.
 */
export const requestedSpawnPosition = (spawn: Vector3): Vector3 =>
    centered(Math.floor(spawn.getX()), Math.floor(spawn.getY()) + 1, Math.floor(spawn.getZ()));

/**
 * Where a player who died comes back, as a Bedrock Dedicated Server 1.26.52 says it, measured
 * with the world spawn at (5, 63, -6):
 *
 * - `announced`: the `SearchingForSpawn` sent at the death, the eyes over the spawn block's
 *   center at its own height, (5.5, 64.62, -5.5);
 * - `block`: the `SearchingForSpawn` that opens the answer to the client's
 *   `ClientReadyToSpawn`, the spawn block itself, (5, 63, -6);
 * - `eyes`: the `ReadyToSpawn` after it, the eyes over the block's corner, (5, 64.62, -6). The
 *   client puts its player there, so the server does too.
 *
 * Unlike {@link placePlayerSpawn} for a join, nothing here is raised one block or centered.
 * @param spawn - the world spawn, in block coordinates.
 * @param eyeHeight - how far above the feet a player's position is.
 */
export const respawnPoint = (spawn: Vector3, eyeHeight: number) => {
    const [x, y, z] = [Math.floor(spawn.getX()), Math.floor(spawn.getY()), Math.floor(spawn.getZ())];
    return {
        announced: centered(x, y + eyeHeight, z),
        block: new Vector3(x, y, z),
        eyes: new Vector3(x, y + eyeHeight, z)
    };
};

/**
 * Places a player who has no position of their own, the way a Bedrock Dedicated Server does.
 *
 * Measured against BDS 1.26.52, one fresh player per case:
 *
 * 1. The feet start one block above the stored spawn height, centered on the block. A height of
 *    {@link UNKNOWN_SPAWN_HEIGHT} starts them on the column's highest block instead.
 * 2. If the feet or the head would be inside a solid block, the player moves up the column to
 *    the first two free blocks.
 * 3. If the first block below the feet is leaves, the player is moved to a random column up to
 *    {@link SPAWN_RELOCATION_RANGE} blocks away on each axis, one block higher. BDS does not
 *    check that column, so neither does this: the player can land over water, or inside a hill.
 * 4. Anything else is kept as it is, even a spot in mid-air, which the player then falls from.
 *
 * Water below the feet is accepted, and so is a column whose top is leaves when the feet end
 * up underneath them: only what the player would land on matters.
 *
 * @param spawn - the world spawn, in block coordinates.
 * @param random - picks each relocation offset; replace it to make placement deterministic.
 */
export const placePlayerSpawn = async (
    spawn: Vector3,
    terrain: SpawnTerrain,
    random: RelocationOffset = randomOffset
): Promise<PlayerSpawn> => {
    const x = Math.floor(spawn.getX());
    const z = Math.floor(spawn.getZ());
    const storedY = Math.floor(spawn.getY());

    const requested = requestedSpawnPosition(spawn);

    let feet =
        storedY >= UNKNOWN_SPAWN_HEIGHT ? ((await terrain.getHighestBlock(x, z)) ?? terrain.minY) + 1 : storedY + 1;

    while (
        feet < terrain.maxY &&
        ((await terrain.isObstructed(x, feet, z)) || (await terrain.isObstructed(x, feet + 1, z)))
    ) {
        feet++;
    }

    let below = feet - 1;
    while (below > terrain.minY && (await terrain.getBlockName(x, below, z)) === AIR) below--;

    if (isLeaves(await terrain.getBlockName(x, below, z))) {
        return { requested, position: centered(x + random(), feet + 1, z + random()), relocated: true };
    }

    return { requested, position: centered(x, feet, z), relocated: false };
};
