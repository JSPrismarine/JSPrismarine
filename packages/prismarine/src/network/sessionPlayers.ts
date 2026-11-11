/**
 * Where a network session finds the player it speaks for.
 *
 * [ADR 0008](../../../../docs/adr/0008-one-entity-model.md) has the session hold its entity's id
 * and no reference to the entity, and [ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)
 * keeps entity objects inside the world. A {@link PlayerSession} therefore holds the player's
 * runtime id and login identity, and reaches the player's state through a {@link SessionPlayers}
 * directory keyed by that id.
 *
 * Live players are still legacy `Player` objects, filed in {@link LegacyPlayers} by
 * `createConnectedPlayer` and forgotten by `PlayerSession.disable`. A world's entity map is not
 * enough: a player is not in it from the login to `SetLocalPlayerAsInitialized`, nor between the
 * two worlds of a dimension change, and the session speaks for it throughout. Package H-D of the
 * entity and tick re-architecture switches the session to `EntityRuntimes.players`, which files
 * store players by the same id and has the same two methods, and deletes {@link LegacyPlayers}.
 */
import type Player from '../Player';
import type { PlayerIdentity } from '../playerIdentity';

/**
 * The player a session speaks for, which `PlayerSession.getPlayer` returns. Still the legacy
 * `Player`. Package H-D of the entity and tick re-architecture makes it the `StorePlayer` that
 * `EntityRuntimes.players` files, and every reader of this alias follows.
 */
export type SessionPlayer = Player;

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

/**
 * The server's legacy players, by entity id.
 *
 * One for the server, like `StorePlayers`, because a player that changes world keeps its id.
 */
export class LegacyPlayers implements SessionPlayers<Player> {
    private readonly byId = new Map<number, Player>();

    /** @inheritdoc */
    public of(id: number): Player | undefined {
        return this.byId.get(id);
    }

    /** Files a player under its runtime id. */
    public add(player: Player): void {
        this.byId.set(Number(player.getRuntimeId()), player);
    }

    /** @inheritdoc */
    public delete(id: number): boolean {
        return this.byId.delete(id);
    }
}

/**
 * What a session holds of a legacy player.
 * @param player - The player the session speaks for.
 * @returns Its runtime id and the identity it logged in with.
 */
export const sessionPlayerRefOf = (player: Player): SessionPlayerRef => ({
    runtimeId: player.getRuntimeId(),
    identity: { name: player.getName(), xuid: player.getXUID() ?? '', uuid: player.getUUID().toString() }
});
