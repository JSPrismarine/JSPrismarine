import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import type Player from '../Player';
import { PlayerComponents } from '../entity/playerComponents';

/**
 * Gives a player double built from `Player.prototype` the component state a constructed player
 * has. Such a double skips the constructor, and a player's vitals, flags and experience read and
 * write through that state. Its writes reach no change log.
 *
 * @param player - The double.
 * @param attributes - Where its food and experience live: the double's own attributes when it
 *   has them, and a fresh player's otherwise.
 * @returns The same double.
 */
export const withPlayerComponents = <T extends Player>(
    player: T,
    attributes: Attributes = player.attributes ?? new Attributes(Attributes.getPlayerDefaults())
): T => {
    Object.defineProperty(player, 'components', { value: new PlayerComponents(attributes, () => {}) });
    return player;
};

/**
 * The experience a plain player stub answers `getExperience` with, kept in `attributes` as a
 * constructed player keeps it.
 */
export const experienceIn = (attributes: Attributes) => new PlayerComponents(attributes, () => {}).experience();
