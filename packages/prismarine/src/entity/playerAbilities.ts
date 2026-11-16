/**
 * The ability names a player's `has_ability` filter test answers.
 *
 * Bedrock's abilities layer gives a creative player `instabuild`, `invulnerable` and `mayfly`, and a
 * spectator `invulnerable`, `mayfly`, `flying` and `noclip`; a survival or adventure player has none
 * of them. A filter such as the warden's `minecraft:mob_effect`, which passes over an invulnerable
 * player, reads these.
 */
import { Gametype } from '@jsprismarine/minecraft';

const CREATIVE_ABILITIES: readonly string[] = ['instabuild', 'invulnerable', 'mayfly'];
const SPECTATOR_ABILITIES: readonly string[] = ['invulnerable', 'mayfly', 'flying', 'noclip'];
const NO_ABILITIES: readonly string[] = [];

/**
 * The abilities a player in a game mode has.
 *
 * @param gamemode - The player's game mode.
 * @returns The ability names `has_ability` matches.
 */
export const playerAbilityNames = (gamemode: Gametype): readonly string[] =>
    gamemode === Gametype.SPECTATOR
        ? SPECTATOR_ABILITIES
        : gamemode === Gametype.CREATIVE
          ? CREATIVE_ABILITIES
          : NO_ABILITIES;
