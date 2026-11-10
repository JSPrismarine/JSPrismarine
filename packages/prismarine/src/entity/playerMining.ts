/**
 * Mining: the cracks a server with server-authoritative block breaking animates on the block a
 * player is mining, every tick, until the block breaks or the player stops. One home for both
 * models of a player (see `survivalPlayer.ts`), and for the world's own crack animation.
 */
import { LevelEvent } from '@jsprismarine/minecraft';

import type { PlayerMining } from './playerComponents';

/**
 * The crack particles, indexed by the face that was struck.
 *
 * Six events rather than one with the face packed into its data, which is how the protocol
 * chose to spell it. Written out rather than computed from the first one, so a renumbering
 * upstream is a compile error here and not a shower of particles off the wrong side.
 */
export const CRACK_PARTICLES: readonly LevelEvent[] = [
    LevelEvent.PARTICLES_CRACK_BLOCK_DOWN,
    LevelEvent.PARTICLES_CRACK_BLOCK_UP,
    LevelEvent.PARTICLES_CRACK_BLOCK_NORTH,
    LevelEvent.PARTICLES_CRACK_BLOCK_SOUTH,
    LevelEvent.PARTICLES_CRACK_BLOCK_WEST,
    LevelEvent.PARTICLES_CRACK_BLOCK_EAST
];

/** One level event a tick of mining sends, at a point. */
export interface MiningEvent {
    readonly at: { readonly x: number; readonly y: number; readonly z: number };
    readonly event: LevelEvent;
    readonly data: number;
}

/** What one tick of mining sends, and whether the mining goes on. */
export interface MiningTick {
    readonly continues: boolean;
    readonly events: readonly MiningEvent[];
}

/** The event that ends the cracks on a block. */
export const stopCracking = ({ x, y, z }: PlayerMining): MiningEvent => ({
    at: { x, y, z },
    event: LevelEvent.STOP_BLOCK_CRACKING,
    data: 0
});

/**
 * One tick of mining: the particles off the face being mined, then the crack progress.
 *
 * A Bedrock Dedicated Server sends this pair every tick for as long as a block is being mined.
 * The particles leave from the block's center and carry its runtime id, which the client textures
 * them with. The progress goes to the block's corner, like the start and the stop.
 *
 * The block can change while it is mined: another player breaks it, or a command or a flood
 * replaces it. The cracks belonged to the block that was there, so they stop with it. A block
 * whose chunk is not loaded is not an answer, and the mining waits: nothing is sent and it goes on.
 * @param {PlayerMining} mining - What is being mined.
 * @param {number | undefined} runtimeId - The runtime id at the mined block now, or undefined when
 *   its chunk is not loaded.
 * @returns {MiningTick} What to send, in order, and whether the mining goes on.
 */
export const mineTick = (mining: PlayerMining, runtimeId: number | undefined): MiningTick => {
    if (runtimeId === undefined) return { continues: true, events: [] };
    if (runtimeId !== mining.runtimeId) return { continues: false, events: [stopCracking(mining)] };

    const { x, y, z, face, progressPerTick } = mining;
    const particles = CRACK_PARTICLES[face];
    return {
        continues: true,
        events: [
            ...(particles === undefined
                ? []
                : [{ at: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, event: particles, data: mining.runtimeId }]),
            { at: { x, y, z }, event: LevelEvent.UPDATE_BLOCK_CRACKING, data: progressPerTick }
        ]
    };
};
