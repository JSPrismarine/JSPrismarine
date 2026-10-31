/**
 * The `SetSpawnPosition` that tells a client where its player comes back.
 *
 * The client shows the point on its compass and its map, so the packet carries the player's
 * own spawn point when they have one, in the dimension the block stands in, which need not be
 * the dimension the player is standing in. A player with no point of their own is told the
 * world spawn of the world they are in. Both positions in the packet are `BlockPos`, and a
 * ZigZag varint write truncates toward zero without a word, so a fractional spawn is floored
 * here rather than sent as the wrong block.
 */
import type { Vector3 } from '@jsprismarine/math';
import SetSpawnPositionPacket, { SpawnPositionType } from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';

import type Player from '../Player';
import { dimensionByName } from '../world/Dimension';
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
 * The `SetSpawnPosition` for a player in a world, as a `PlayerRespawn` point.
 *
 * @param world - The world the player is in, whose dimension and spawn answer for a player
 *   with no spawn point of their own.
 * @param worldSpawn - The world's spawn, which the caller has already asked the world for.
 */
export const playerSpawnPositionPacket = (
    player: Player,
    world: World,
    worldSpawn: Vector3
): SetSpawnPositionPacket => {
    const own = player.getSpawnPoint();
    const joinDimension = world.getDimension().bedrockId;

    const position =
        own === undefined
            ? { x: Math.floor(worldSpawn.getX()), y: Math.floor(worldSpawn.getY()), z: Math.floor(worldSpawn.getZ()) }
            : { x: Math.floor(own.x), y: Math.floor(own.y), z: Math.floor(own.z) };
    const dimension =
        own === undefined ? joinDimension : spawnDimensionIdOf(world.getLevel(), own.dimension, joinDimension);

    return new SetSpawnPositionPacket({
        type: SpawnPositionType.PlayerRespawn,
        position,
        dimension,
        blockPosition: position
    });
};
