import type Server from '../Server';
import type { StorePlayer } from '../entity/storePlayer';
import type { PlayerIdentity } from '../playerIdentity';
import type { World } from '../world/World';
import type ClientConnection from './ClientConnection';
import PlayerSession from './PlayerSession';

/**
 * Joins a login's store player to the connection it speaks through.
 *
 * The one place that knows both halves: the store player is filed in the server's directory by
 * its entity id, and the session built to speak for it holds that id. The pair is live when this
 * returns - the session is in the chunk rotation and the connection will route packets to it -
 * but the player has not joined yet. That is {@link PlayerSession.join}, and if it fails the
 * caller tears the pair down through {@link ClientConnection.closePlayerSession}.
 * @param {object} options - The pieces to join.
 * @param {Server} options.server - The server both belong to.
 * @param {ClientConnection} options.connection - The connection that will own the session.
 * @param {StorePlayer} options.player - The store player the login built, in no store yet.
 * @param {PlayerIdentity} options.identity - Who logged in, which the session holds.
 * @param {World} options.world - The world the login puts the player in.
 * @returns {PlayerSession} The session, already attached to the connection.
 * @example
 * ```typescript
 * const session = createConnectedPlayer({ server, connection, player, identity, world });
 * await session.join();
 * ```
 */
export const createConnectedPlayer = ({
    server,
    connection,
    player,
    identity,
    world
}: {
    server: Server;
    connection: ClientConnection;
    player: StorePlayer;
    identity: PlayerIdentity;
    world: World;
}): PlayerSession => {
    // Filed by id before the session exists, because the session holds the id and not the
    // player. `PlayerSession.disable` forgets it.
    const players = server.getStorePlayers();
    players.add(player);
    const session = new PlayerSession(
        server,
        connection,
        { runtimeId: player.getRuntimeId(), identity },
        players,
        world
    );

    connection.attachPlayerSession(session);
    session.enable();

    return session;
};
