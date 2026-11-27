/**
 * What a death and a respawn do to a player's survival state. One home for both models of a
 * player (see `survivalPlayer.ts`).
 */
import { refillBreath } from './playerBreath';
import type { SurvivalPlayer } from './survivalPlayer';

/**
 * A death ends the drowning in progress. Stopping the mining is the caller's, because it sends
 * the stop of the cracks.
 * @param {SurvivalPlayer} player - The player who died.
 */
export const diedVitals = (player: SurvivalPlayer): void => {
    player.components.set('vitals.drowningTicks', 0);
};

/**
 * What a respawn gives a player: every attribute back at its default, full lungs, and a body that
 * is not running, crouching, flying or sleeping. These survive a death because nothing else resets
 * them, and the client draws what it is told. Health is the caller's, because a legacy player's
 * lives in the attribute table this resets and a store player's on its entity.
 *
 * The experience level and bar are attributes too, and they come through as the death left them:
 * a death without `minecraft:keep_inventory` already took them (see `PlayerSession.die`), and one
 * with it keeps them, as Java's `ServerPlayer.restoreFrom` does.
 * @param {SurvivalPlayer} player - The player coming back.
 * @javaSource ServerPlayer.restoreFrom
 */
export const respawnVitals = (player: SurvivalPlayer): void => {
    const { components } = player;
    const level = components.get('experience.level');
    const progress = components.get('experience.progress');
    components.resetAttributes();
    components.set('experience.level', level);
    components.set('experience.progress', progress);
    refillBreath(player);
    components.set('movement.sprinting', false);
    components.set('movement.sneaking', false);
    components.set('movement.sneakingSince', null);
    components.set('movement.sleeping', false);
    components.set('abilities.flying', false);
};
