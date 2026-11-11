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
    /** How many ticks the break takes for the tool in hand; infinite for an unbreakable block. */
    readonly breakTicks: number;
    /** The server tick the player began mining this block on. */
    readonly startedAt: number;
}

/**
 * A player's mining as the logged plain data its component keeps.
 * @param {BlockMining} mining - What the player is mining.
 * @returns {PlayerMining} The same block as plain data.
 */
export function playerMiningOf(mining: BlockMining): PlayerMining;
/**
 * A player's mining, or its absence, as the logged plain data its component keeps.
 * @param {BlockMining | null} mining - What the player is mining, or null when nothing.
 * @returns {PlayerMining | null} The same block as plain data, or null for null.
 */
export function playerMiningOf(mining: BlockMining | null): PlayerMining | null;
/**
 * A player's mining, or its absence, as the logged plain data its component keeps.
 * @param {BlockMining | null} mining - What the player is mining, or null when nothing.
 * @returns {PlayerMining | null} The same block as plain data, or null for null.
 */
export function playerMiningOf(mining: BlockMining | null): PlayerMining | null {
    if (mining === null) return null;
    const { position, face, runtimeId, progressPerTick } = mining;
    return { x: position.getX(), y: position.getY(), z: position.getZ(), face, runtimeId, progressPerTick };
}

/**
 * The mining a player's component keeps, as the world animates it.
 * @param {PlayerMining} mining - The logged plain data.
 * @returns {BlockMining} The same block, with its position as a vector.
 */
export function blockMiningOf(mining: PlayerMining): BlockMining;
/**
 * The mining a player's component keeps, or its absence, as the world animates it.
 * @param {PlayerMining | null} mining - The logged plain data, or null when nothing is mined.
 * @returns {BlockMining | null} The same block, with its position as a vector, or null for null.
 */
export function blockMiningOf(mining: PlayerMining | null): BlockMining | null;
/**
 * The mining a player's component keeps, or its absence, as the world animates it.
 * @param {PlayerMining | null} mining - The logged plain data, or null when nothing is mined.
 * @returns {BlockMining | null} The same block, with its position as a vector, or null for null.
 */
export function blockMiningOf(mining: PlayerMining | null): BlockMining | null {
    if (mining === null) return null;
    const { x, y, z, face, runtimeId, progressPerTick } = mining;
    return { position: new Vector3(x, y, z), face, runtimeId, progressPerTick };
}

/**
 * How many ticks early a predicted break may arrive. Network jitter can delay the start of
 * mining more than the prediction that ends it, which makes the break look shorter on the
 * server than it was on the client.
 */
export const MINING_LATENCY_TICKS = 5;

/** The effects that speed mining up, each by a fifth per level. Conduit power counts as haste. */
const HASTE_EFFECTS = ['minecraft:haste', 'minecraft:conduit_power'] as const;

/**
 * The fewest ticks a break may have taken before the server accepts a client's prediction
 * that the block gave way.
 *
 * The break time is the server's for the tool in hand. A client mining faster through haste
 * is allowed for, by its strongest haste or conduit power level. Mining fatigue, water and
 * being off the ground only slow a break down, so they never make a real break come in early
 * and are left out. {@link MINING_LATENCY_TICKS} come off the result as slack.
 *
 * @param mining - What the player is mining.
 * @param miner - Whose effects to read.
 * @returns The minimum ticks; infinite for a block that never breaks.
 */
export const minimumBreakTicks = (
    mining: Pick<BlockMining, 'breakTicks'>,
    miner: { getStatusEffect(identifier: string): { readonly amplifier: number } | undefined }
): number => {
    if (!Number.isFinite(mining.breakTicks)) return Number.POSITIVE_INFINITY;

    const hasteLevel = Math.max(0, ...HASTE_EFFECTS.map((id) => (miner.getStatusEffect(id)?.amplifier ?? -1) + 1));
    return Math.max(0, Math.floor(mining.breakTicks / (1 + 0.2 * hasteLevel)) - MINING_LATENCY_TICKS);
};
