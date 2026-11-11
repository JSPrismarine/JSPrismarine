/**
 * Where a network session finds the player it speaks for.
 *
 * [ADR 0008](../../../../docs/adr/0008-one-entity-model.md) has the session hold its entity's id
 * and no reference to the entity, and [ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)
 * keeps entity objects inside the world. A {@link PlayerSession} therefore holds the player's
 * runtime id and login identity, and reaches the player's state through a {@link SessionPlayers}
 * directory keyed by that id: the server's `StorePlayers`, which `createConnectedPlayer` files the
 * store player in at the login and `PlayerSession.disable` forgets it from. A world's entity
 * store is not enough: a player is in none from the login to `SetLocalPlayerAsInitialized`, nor
 * between the two worlds of a dimension change, and the session speaks for it throughout.
 */
import type { StorePlayer } from '../entity/storePlayer';
import type { PlayerIdentity } from '../playerIdentity';

/** The player a session speaks for, which `PlayerSession.getPlayer` returns. */
export type SessionPlayer = StorePlayer;

/** The players sessions speak for, by entity id. */
export interface SessionPlayers<P> {
    /** The player with this entity id, or undefined once it has left the server. */
    of(id: number): P | undefined;
    /** Forgets a player that left the server. @returns Whether it was filed. */
    delete(id: number): boolean;
}

/** What a session holds of its player: the entity's id and who logged in. */
export interface SessionPlayerRef {
    /** The player's entity id, as the wire carries it. */
    readonly runtimeId: bigint;
    readonly identity: PlayerIdentity;
}
