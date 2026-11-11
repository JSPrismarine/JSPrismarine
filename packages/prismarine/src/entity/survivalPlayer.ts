/**
 * One player as the survival rules read and write it: hunger, breath, falls, meals and mining.
 *
 * The rules live once, in `playerHunger.ts`, `playerBreath.ts`, `playerFall.ts`,
 * `playerMeal.ts` and `playerMining.ts`, and run over any holder of a player's components, which
 * the store's player systems (`entity/data/playerSystems.ts`) hand them from a store player.
 * Every write a rule makes goes through {@link PlayerComponents}, so the change log hears it. A
 * rule that hurts or heals returns what to do instead of doing it, so the caller runs the blow
 * through the store's pipeline.
 */
import { Gametype } from '@jsprismarine/minecraft';

import type { PlayerComponents } from './playerComponents';

/** Whether hunger, breath and falls reach a player in a game mode, which they do in survival and adventure. */
export const survivalReaches = (gamemode: Gametype): boolean =>
    gamemode === Gametype.SURVIVAL || gamemode === Gametype.ADVENTURE;

/** What a survival rule reads of a player besides its components. */
export interface SurvivalPlayer {
    /** The player's logged component state, which every rule writes through. */
    readonly components: PlayerComponents;
    /** Whether hunger, breath and falls reach the player, which is true in survival and adventure. */
    vulnerable(): boolean;
    /** Whether the player is alive. */
    alive(): boolean;
    /** The player's health, in half-hearts. */
    health(): number;
    /** The player's maximum health. */
    maxHealth(): number;
}
