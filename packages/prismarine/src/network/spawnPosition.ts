/**
 * The `SetSpawnPosition` that tells a client where its player comes back.
 *
 * The client shows the point on its compass and its map, so the packet carries the player's
 * own spawn point when they have one, in the dimension the block stands in, which need not be
 * the dimension the player is standing in. A player with no point of their own is told the
 * level's Overworld spawn in the Overworld, which is where `Player.getRespawnPoint` lands them
 * without a bed, whatever world they are standing in. Both positions in the packet are
 * `BlockPos`, and a ZigZag varint write truncates toward zero without a word, so a fractional
 * spawn is floored here rather than sent as the wrong block.
 */
import type { Vector3 } from '@jsprismarine/math';
import SetSpawnPositionPacket, { SpawnPositionType } from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import type Player from '../Player';
import { Dimensions, dimensionByName } from '../world/Dimension';
import type { Level } from '../world/Level';
import type { World } from '../world/World';

/**
 * The Bedrock id of the dimension a stored spawn point names.
 *
 * A stored point carries the dimension's name as `DimensionType.name` spells it, which is the
 * Bedrock spelling for the vanilla three and the Java id for a custom type. The level's own
 * types answer first, so a custom type resolves to the id the level chose; the vanilla table
 * answers either spelling after that.
 *
 * @param fallback - The id to answer for a name no dimension has, such as one from a level
 *   that no longer defines it.
 */
export const spawnDimensionIdOf = (level: Level, dimensionName: string, fallback: number): number => {
    for (const type of level.getDimensionTypes().values()) {
        if (type.name === dimensionName || type.id === dimensionName) return type.bedrockId;
    }
    return dimensionByName(dimensionName)?.bedrockId ?? fallback;
};

/**
 * The Overworld spawn of the level a world belongs to, which is where a player with no spawn
 * of their own comes back.
 *
 * The Overworld's own spawn is the level's, so a world of that dimension is asked directly.
 * From any other world, the level answers once its Overworld has found the spawn; before
 * that, the Overworld is asked, which builds that world when nothing has yet.
 *
 * @param world - The world the player is in.
 */
export const overworldSpawnOf = async (world: World): Promise<Vector3> => {
    if (world.getDimension().bedrockId === Dimensions.Overworld.bedrockId) return world.getSpawnPosition();

    const level = world.getLevel();
    const known = level.getSpawn();
    if (known !== null) return known;
    const overworld = await level.world(OVERWORLD_STEM_ID);
    return overworld.getSpawnPosition();
};

/**
 * The `SetSpawnPosition` for a player in a world, as a `PlayerRespawn` point.
 *
 * @param world - The world the player is in, whose level resolves the dimension of a spawn
 *   point of the player's own.
 * @param overworldSpawn - The level's Overworld spawn, from {@link overworldSpawnOf}, which
 *   answers for a player with no spawn point of their own.
 */
export const playerSpawnPositionPacket = (
    player: Player,
    world: World,
    overworldSpawn: Vector3
): SetSpawnPositionPacket => {
    const own = player.getSpawnPoint();

    const position =
        own === undefined
            ? {
                  x: Math.floor(overworldSpawn.getX()),
                  y: Math.floor(overworldSpawn.getY()),
                  z: Math.floor(overworldSpawn.getZ())
              }
            : { x: Math.floor(own.x), y: Math.floor(own.y), z: Math.floor(own.z) };
    const dimension =
        own === undefined
            ? Dimensions.Overworld.bedrockId
            : spawnDimensionIdOf(world.getLevel(), own.dimension, world.getDimension().bedrockId);

    return new SetSpawnPositionPacket({
        type: SpawnPositionType.PlayerRespawn,
        position,
        dimension,
        blockPosition: position
    });
};
