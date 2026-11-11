/**
 * The entity classes this server still writes by hand.
 *
 * Every other entity is a component set in the data-driven runtime, shown through its store
 * actor; see `data/EntityRuntime` and `data/storeActors`. This file used to carry 111 classes
 * beside it, one per species, most with no behavior beyond a name and a `MOB_ID`.
 *
 * `Human` is the player body. Dropped stacks, falling blocks, TNT and projectiles run through the
 * data-driven runtime, and a saved actor no pack declares comes back as an inert store entity.
 */
import Human from './Human';

export { Human };

/**
 * The player body, under the name this module used to give it.
 * @deprecated Use {@link Human}. A player is reached through its session, by entity id.
 */
export const Player = Human;
/** @deprecated Use {@link Human}. */
export type Player = Human;
