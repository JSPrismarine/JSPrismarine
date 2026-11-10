/**
 * Falls: how far a player has dropped since they were last supported, and what the landing costs.
 * One home for both models of a player (see `survivalPlayer.ts`).
 *
 * The client owns a player's movement (ADR 0008), so the server cannot know a fall's length
 * except by adding up the positions it is told, which is what {@link trackFall} does.
 */
import { breaksAFall, FALL_GRACE } from './Environment';
import type { SurvivalPlayer } from './survivalPlayer';

/**
 * Adds a step the client reported to the fall in progress.
 *
 * Rising resets it, which is what makes the fall start at the top of a jump rather than at the
 * ground the player jumped from - otherwise every jump would be measured from the floor and land
 * for its own height. A player on the ground, flying, or out of reach of falls is not falling.
 * @param {SurvivalPlayer} player - The player.
 * @param {number} fromY - The height the player was at.
 * @param {number} toY - The height the player is at now.
 * @param {{ onGround: boolean; flying: boolean }} state - Whether the player was on the ground
 *   before this step, and whether they are flying.
 */
export const trackFall = (
    player: SurvivalPlayer,
    fromY: number,
    toY: number,
    { onGround, flying }: { readonly onGround: boolean; readonly flying: boolean }
): void => {
    const { components } = player;
    if (onGround || flying || !player.vulnerable()) {
        components.set('vitals.fallDistance', 0);
        return;
    }

    const climb = toY - fromY;
    components.set('vitals.fallDistance', climb > 0 ? 0 : components.get('vitals.fallDistance') - climb);
};

/**
 * Whether what a player stands in, or on, breaks a fall: water from inside it, hay from
 * underneath.
 * @param {string | undefined} feet - The block the feet are in, or undefined when its chunk is not loaded.
 * @param {string | undefined} below - The block under it, or undefined when its chunk is not loaded.
 * @returns {boolean} Whether the landing is cushioned. A block nobody can read cushions it: not
 *   being able to answer is not a reason to hurt the player, and nothing is loaded to find out.
 */
export const cushions = (feet: string | undefined, below: string | undefined): boolean =>
    feet === undefined || below === undefined || breaksAFall(feet) || breaksAFall(below);

/**
 * Ends the fall in progress and says what the landing costs: one half-heart per block past the
 * third, which is vanilla's rule. Landing in anything that breaks a fall costs nothing.
 * @param {SurvivalPlayer} player - The player, who has just reached the ground.
 * @param {boolean} fallDamageAllowed - Whether the `fallDamage` game rule is on.
 * @param {() => boolean} cushioned - Whether the landing is cushioned; see {@link cushions}. Read
 *   only for a fall that would hurt.
 * @returns {number | undefined} The fall damage to deal, in half-hearts, or undefined for none.
 */
export const land = (
    player: SurvivalPlayer,
    fallDamageAllowed: boolean,
    cushioned: () => boolean
): number | undefined => {
    const fallen = player.components.get('vitals.fallDistance');
    player.components.set('vitals.fallDistance', 0);

    if (fallen <= FALL_GRACE || !player.vulnerable()) return undefined;
    if (!fallDamageAllowed || cushioned()) return undefined;

    const damage = Math.floor(fallen - FALL_GRACE);
    return damage > 0 ? damage : undefined;
};
