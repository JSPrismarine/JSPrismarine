/**
 * Breath: a player's air empties while their head is underwater, refills out of it, and an empty
 * bar drowns them. One home for both models of a player (see `survivalPlayer.ts`), and the one
 * owner of a player's air: a store player's `minecraft:breathable` keeps no air of its own.
 */
import { DROWNING_DAMAGE, DROWNING_INTERVAL, isUnderwater } from './Environment';
import type { SurvivalPlayer } from './survivalPlayer';

/** Ticks of breath regained per tick out of the water; the bar empties at one. */
const AIR_REGAIN_PER_TICK = 5;

/** Breath is only reported to the client in steps of this many ticks; see {@link breathWorthSending}. */
export const AIR_SYNC_STEP = 10;

/** A player's breath as a client is told it: the ticks of air left and whether it is breathing. */
export interface ShownBreath {
    readonly air: number;
    readonly breathing: boolean;
}

/**
 * Whether a player's breath has moved far enough from what its client was last told to be worth
 * a packet.
 *
 * Air moves every tick underwater, and the bubble bar is ten bubbles over fifteen seconds, so
 * sending each of those 300 values would be 290 packets that change nothing on screen. A step of
 * {@link AIR_SYNC_STEP} ticks is finer than the bar can show. Empty and full are sent exactly,
 * whatever step they fall in.
 * @param {ShownBreath} sent - What the client was last told.
 * @param {ShownBreath} now - The breath as it is.
 * @param {number} maxAir - A full lungful, in ticks.
 * @returns {boolean} Whether to send it.
 */
export const breathWorthSending = (sent: ShownBreath, now: ShownBreath, maxAir: number): boolean => {
    const step = (ticks: number) => Math.floor(ticks / AIR_SYNC_STEP);
    return (
        now.breathing !== sent.breathing ||
        step(now.air) !== step(sent.air) ||
        ((now.air === 0 || now.air === maxAir) && now.air !== sent.air)
    );
};

/**
 * One tick of breath, which the caller runs only for a player breath reaches: alive, and in
 * survival or adventure.
 *
 * What drowns a player is their head underwater, rather than standing in water up to the knees,
 * so the caller reads the block the eyes are in. A block whose chunk is not loaded is not an
 * answer, and the player waits: nothing empties, refills or drowns until it is loaded.
 * @param {SurvivalPlayer} player - The player.
 * @param {string | undefined} head - The name of the block the player's eyes are in, or undefined
 *   when its chunk is not loaded.
 * @param {boolean} drowningAllowed - Whether the `drowningDamage` game rule is on. The bar still
 *   empties either way: the client draws it, and a world with drowning turned off is not one
 *   where nobody is underwater.
 * @returns {number | undefined} The drowning damage to deal, in half-hearts, or undefined for none.
 */
export const breathe = (
    player: SurvivalPlayer,
    head: string | undefined,
    drowningAllowed: boolean
): number | undefined => {
    if (head === undefined) return undefined;

    const { components } = player;
    const air = components.get('vitals.air');

    if (isUnderwater(head)) {
        components.set('vitals.breathing', false);
        components.set('vitals.air', air - 1);

        if (components.get('vitals.air') > 0) components.set('vitals.drowningTicks', 0);
        else {
            const drowning = components.get('vitals.drowningTicks') + 1;
            components.set('vitals.drowningTicks', drowning >= DROWNING_INTERVAL ? 0 : drowning);
            if (drowning >= DROWNING_INTERVAL && drowningAllowed) return DROWNING_DAMAGE;
        }
        return undefined;
    }

    components.set('vitals.drowningTicks', 0);
    components.set('vitals.breathing', true);
    // Vanilla refills the bar far faster than it empties: a lungful is a few seconds of
    // surfacing, not another fifteen.
    if (air < components.maxAir()) components.set('vitals.air', air + AIR_REGAIN_PER_TICK);
    return undefined;
};

/**
 * Full lungs and no drowning in progress, which is what a respawn gives a player.
 * @param {SurvivalPlayer} player - The player.
 */
export const refillBreath = (player: SurvivalPlayer): void => {
    const { components } = player;
    components.set('vitals.air', components.maxAir());
    components.set('vitals.breathing', true);
    components.set('vitals.drowningTicks', 0);
};
