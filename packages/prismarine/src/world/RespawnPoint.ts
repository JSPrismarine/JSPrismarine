/**
 * Where one player comes back, as opposed to where the world's spawn is.
 *
 * This server modeled no per-player spawn at all: `Player.getRespawnPoint` answered with the
 * world spawn for everybody, sleeping in a bed set nothing, and `/spawnpoint` was left out of
 * the command registry because there was nothing behind it.
 *
 * The rules are Java's, from `ServerPlayer.findRespawnPositionAndUseSpawnBlock`:
 *
 * 1. A point `/spawnpoint` set is used as it stands. Java calls this a forced spawn and honors
 *    it whatever is standing there, which is the whole point of the command.
 * 2. A point a bed or a respawn anchor set is only used while that block is still there. Java
 *    tells the player their home bed was missing or obstructed and sends them to the world spawn
 *    otherwise, which is the case this module calls `destroyed`.
 * 3. The player stands beside the block rather than inside it, in the first of the eight
 *    neighboring columns with two free blocks. A bed with no free column around it is obstructed,
 *    and is the same refusal as a bed that is gone.
 *
 * {@link SpawnPlacement} answers the other half of the question, which is where a player with no
 * position at all is put on their first join.
 */
import { Vector3 } from '@jsprismarine/math';

/** Where a player comes back, as the player record carries it. */
export interface StoredSpawnPoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** The dimension the block stands in, such as `minecraft:overworld`. */
    readonly dimension: string;
    /**
     * Whether the point is used whatever stands there.
     *
     * True for `/spawnpoint`, which is Java's forced spawn, and false for a bed or a respawn
     * anchor, which only holds a spawn while the block itself does.
     */
    readonly forced?: boolean;
}

/** What resolving a spawn point needs to know about the world it names. */
export interface RespawnTerrain {
    readonly minY: number;
    readonly maxY: number;
    /** Whether a player's body cannot occupy the block. */
    isObstructed(x: number, y: number, z: number): Promise<boolean>;
    /** The block's state name, such as `minecraft:red_bed`. */
    getBlockName(x: number, y: number, z: number): Promise<string>;
}

/** What a stored spawn point resolved to. */
export type ResolvedSpawn =
    /** The feet position the player comes back at. */
    | { readonly kind: 'honored'; readonly position: Vector3 }
    /** The block that held the spawn is gone, or has nowhere free to stand. */
    | { readonly kind: 'destroyed' };

/** The eight columns around a block, nearest first, which is where Java stands a sleeper up. */
const AROUND: readonly (readonly [number, number])[] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
];

/** The bare name of a namespaced identifier: `minecraft:red_bed` is `red_bed`. */
const bareName = (identifier: string): string => identifier.replace(/^[^:]*:/, '');

/**
 * Whether a block holds a player's spawn point when they use it.
 *
 * The beds, whose identifiers are `bed` on Bedrock and `<color>_bed` on Java, and the respawn
 * anchor. Charging the anchor is not modeled, so an anchor holds a spawn the way a bed does.
 */
export const isRespawnBlock = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === 'bed' || name.endsWith('_bed') || name === 'respawn_anchor';
};

/** Whether a player's feet and head both fit in a column. */
const fits = async (terrain: RespawnTerrain, x: number, y: number, z: number): Promise<boolean> => {
    if (y < terrain.minY || y + 1 >= terrain.maxY) return false;
    return !(await terrain.isObstructed(x, y, z)) && !(await terrain.isObstructed(x, y + 1, z));
};

/**
 * Where a stored spawn point actually puts a player, or that it no longer does.
 *
 * @param spawn - The point the player record carries.
 * @param terrain - The world the point names, which the caller has already resolved.
 */
export const resolveRespawn = async (spawn: StoredSpawnPoint, terrain: RespawnTerrain): Promise<ResolvedSpawn> => {
    const { x, y, z } = { x: Math.floor(spawn.x), y: Math.floor(spawn.y), z: Math.floor(spawn.z) };

    // A point the command set, used as it stands. Java's forced spawn does not check the block,
    // which is what makes `/spawnpoint` able to name a spot in mid-air or inside a wall.
    if (spawn.forced === true) return { kind: 'honored', position: new Vector3(x, y, z) };

    if (!isRespawnBlock(await terrain.getBlockName(x, y, z))) return { kind: 'destroyed' };

    for (const [dx, dz] of AROUND) {
        if (await fits(terrain, x + dx, y, z + dz)) {
            return { kind: 'honored', position: new Vector3(x + dx, y, z + dz) };
        }
    }

    // A bed walled in on every side. Java reports the same thing for this as for a bed that is
    // gone, and sends the player to the world spawn.
    return { kind: 'destroyed' };
};
