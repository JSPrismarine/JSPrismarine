import { Vector3 } from '@jsprismarine/math';

import type { PlayerMining } from '../entity/playerComponents';

/**
 * A block a player is mining, and what its crack animation needs each tick.
 *
 * Kept on the player between the action that starts the mining and the one that ends it,
 * because a server with server-authoritative block breaking animates the cracks itself,
 * every tick, rather than waiting for the client to report each swing.
 */
export interface BlockMining {
    /** The block, in block coordinates. */
    readonly position: Vector3;
    /** The face being mined, 0 to 5 as the protocol numbers faces. */
    readonly face: number;
    /** The block's runtime id, which the client textures the particles with. */
    readonly runtimeId: number;
    /** How much of the 65535 a full break takes one tick is worth. */
    readonly progressPerTick: number;
}

/**
 * A player's mining as the logged plain data its component keeps.
 * @param {BlockMining} mining - What the player is mining.
 * @returns {PlayerMining} The same block as plain data.
 */
export const playerMiningOf = ({ position, face, runtimeId, progressPerTick }: BlockMining): PlayerMining => ({
    x: position.getX(),
    y: position.getY(),
    z: position.getZ(),
    face,
    runtimeId,
    progressPerTick
});

/**
 * The mining a player's component keeps, as the world animates it.
 * @param {PlayerMining} mining - The logged plain data.
 * @returns {BlockMining} The same block, with its position as a vector.
 */
export const blockMiningOf = ({ x, y, z, face, runtimeId, progressPerTick }: PlayerMining): BlockMining => ({
    position: new Vector3(x, y, z),
    face,
    runtimeId,
    progressPerTick
});
