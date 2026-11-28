import type { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';

import { CREATIVE_REACH, SURVIVAL_REACH } from '../../entity/Combat';

/**
 * The slack added to a player's reach when checking the actor they say they interacted with.
 *
 * Reach is measured from the player's feet to the actor's feet, and a tall actor is clicked
 * well above where it stands. One block covers that. The check bounds nonsense rather than
 * policing reach.
 */
const REACH_SLACK = 1;

/** What {@link actorReachRefusal} reads of the player. */
export interface ReachingPlayer {
    readonly gamemode: Gametype;
    getPosition(): Vector3;
}

/**
 * Why an actor a player says it interacted with is out of its reach, or null when it is in reach.
 *
 * @param player - The player.
 * @param position - The actor's position.
 * @returns The distance, fit for a log line, or null.
 */
export const actorReachRefusal = (player: ReachingPlayer, position: Vector3): string | null => {
    const reach = (player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH) + REACH_SLACK;
    const distance = player.getPosition().distanceTo(position);
    // Written so a NaN distance fails too.
    return distance <= reach ? null : `${distance.toFixed(1)} away`;
};
