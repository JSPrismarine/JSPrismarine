import type { Vector3 } from '@jsprismarine/math';
import type Player from '../../Player';
import { CREATIVE_REACH } from '../../entity/Combat';

/**
 * How far from the player a block named in a packet may stand.
 *
 * Every packet checked through {@link blockTargetRejection} comes from a screen the player
 * opened by using the block, so a real position is within reach. `CREATIVE_REACH` is the
 * furthest any player can use a block from, and the extra block covers the distance from a
 * player's feet to their eyes and from a block's corner to its middle. This bounds nonsense;
 * it is not an anti-cheat reach check.
 */
export const MAX_BLOCK_TARGET_DISTANCE = CREATIVE_REACH + 1;

/**
 * Why a block position a client sent must not be acted on, or null when it names one of
 * `blocks` within reach.
 *
 * Three checks, cheapest first. The position has to be within
 * {@link MAX_BLOCK_TARGET_DISTANCE} of the player. Its chunk has to be in memory already:
 * the block is read through `getLoadedChunk`, never `getChunkAt`, so a crafted packet cannot
 * make the server load or generate terrain. The block there has to be one of `blocks`.
 *
 * The block is checked rather than a block entity because the server only files block
 * entities it read from disk; a lectern a player placed has none, and refusing it would
 * drop every legitimate packet.
 *
 * @param blocks - The block names the packet may name, such as `minecraft:lectern`.
 * @returns The reason to drop the packet, fit for a log line, or null to go ahead.
 */
export const blockTargetRejection = (player: Player, position: Vector3, blocks: ReadonlySet<string>): string | null => {
    const distance = player.getPosition().distanceTo(position);
    if (!Number.isFinite(distance) || distance > MAX_BLOCK_TARGET_DISTANCE) {
        return `it is ${distance.toFixed(1)} blocks away`;
    }

    const x = position.getX();
    const y = position.getY();
    const z = position.getZ();
    const chunk = player.getWorld().getLoadedChunk(x >> 4, z >> 4);
    if (chunk === null) return 'its chunk is not loaded';

    const { name } = chunk.getBlock(x, y, z);
    if (!blocks.has(name)) return `the block there is ${name}`;

    return null;
};
