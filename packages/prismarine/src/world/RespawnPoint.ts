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

/** The two kinds of block that hold a player's spawn point. */
export type RespawnBlockKind = 'bed' | 'respawn_anchor';

/**
 * Which kind of spawn-holding block an identifier names, or undefined for any other block.
 *
 * The beds, whose identifiers are `bed` on Bedrock and `<color>_bed` on Java, and the respawn
 * anchor. Charging the anchor is not modeled, so an anchor holds a spawn the way a bed does.
 */
export const respawnBlockKind = (identifier: string): RespawnBlockKind | undefined => {
    const name = bareName(identifier);
    if (name === 'bed' || name.endsWith('_bed')) return 'bed';
    if (name === 'respawn_anchor') return 'respawn_anchor';
    return undefined;
};

/** Whether a block holds a player's spawn point when they use it: see {@link respawnBlockKind}. */
export const isRespawnBlock = (identifier: string): boolean => respawnBlockKind(identifier) !== undefined;

/** The `dimension_type` environment attribute that says whether a bed can set a spawn there. */
const BED_RULE_ATTRIBUTE = 'minecraft:gameplay/bed_rule';
/** The `dimension_type` environment attribute that says whether a respawn anchor works there. */
const RESPAWN_ANCHOR_WORKS_ATTRIBUTE = 'minecraft:gameplay/respawn_anchor_works';

/**
 * Whether a bed or a respawn anchor sets a spawn in a dimension, by that dimension type's
 * environment attributes.
 *
 * Java reads `minecraft:gameplay/bed_rule` with `can_set_spawn` for a bed and
 * `minecraft:gameplay/respawn_anchor_works` for an anchor. The 26.3 documents let a bed set a
 * spawn in the Overworld only and an anchor work in the Nether only. A type that leaves the
 * bed rule out gets Java's default, which allows it; one that leaves the anchor flag out gets
 * Java's default, which does not. A block that is neither answers false.
 *
 * Where the answer is false, Java explodes the block. That explosion is not modeled yet, so the
 * caller only declines to move the spawn.
 *
 * @param identifier - The block clicked, such as `minecraft:red_bed`.
 * @param attributes - The dimension type's `attributes`, as `DimensionTypeDefinition` carries them.
 */
export const respawnBlockWorksIn = (identifier: string, attributes: ReadonlyMap<string, unknown>): boolean => {
    switch (respawnBlockKind(identifier)) {
        case 'bed': {
            const rule = attributes.get(BED_RULE_ATTRIBUTE);
            if (typeof rule !== 'object' || rule === null || !('can_set_spawn' in rule)) return true;
            return rule.can_set_spawn !== 'never';
        }
        case 'respawn_anchor':
            return attributes.get(RESPAWN_ANCHOR_WORKS_ATTRIBUTE) === true;
        default:
            return false;
    }
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
