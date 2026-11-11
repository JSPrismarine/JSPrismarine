/**
 * How a packet handler reaches the player its session speaks for.
 *
 * A handler reads the player's state from its store player, and changes it through the homes
 * package H-B3 of the entity and tick re-architecture named: a client operation on the session,
 * and an input, such as a sneak or a jump, through the entity runtime of the session's world. It
 * calls a `Player` method only where that method posts a player event, where the callee takes a
 * `Player`, or for what the player still keeps: the respawn, the pose writes of a move and the
 * item-use clock.
 */
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { StorePlayer } from '../../entity/storePlayer';
import type PlayerSession from '../PlayerSession';

/**
 * The store player a session speaks for: its entity while it is in a store, and the inventory,
 * crafting grid, components, look and identity beside it.
 * @param session - The sender's session.
 * @returns The store player.
 * @throws {Error} Once the session has forgotten its player.
 */
export const storePlayerOf = (session: Pick<PlayerSession, 'getPlayer'>): StorePlayer =>
    session.getPlayer().getStorePlayer();

/**
 * The entity runtime that takes the inputs of a session's player: the runtime of the session's
 * world, which writes through its player systems while the player's entity is in its store, and
 * onto the store player's components while it is in none.
 * @param session - The sender's session.
 * @returns The runtime.
 */
export const playerInputsOf = (session: Pick<PlayerSession, 'getWorld'>): EntityRuntime =>
    session.getWorld().dataEntities().runtime;
