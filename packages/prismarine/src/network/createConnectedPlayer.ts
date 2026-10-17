import type Player from '../Player';
import type Server from '../Server';
import type ClientConnection from './ClientConnection';
import PlayerSession from './PlayerSession';

/**
 * Joins a player to the connection it speaks through.
 *
 * The one place that knows both halves. Neither the `Player` nor the `PlayerSession` builds
 * the other: the player used to construct its own session and hand it a half-built `this`,
 * which made the two modules import each other at runtime and left the connection merely
 * adopting whatever the player had already made. Composition belongs outside both.
 *
 * The pair is live when this returns - the session is in the chunk rotation and the
 * connection will route packets to it - but the player has not joined yet. That is
 * {@link Player.enable}, and if it fails the caller tears the pair down through
 * {@link ClientConnection.closePlayerSession}.
 * @param {object} options - The pieces to join.
 * @param {Server} options.server - The server both belong to.
 * @param {ClientConnection} options.connection - The connection that will own the session.
 * @param {Player} options.player - The player, freshly constructed and inert.
 * @returns {PlayerSession} The session, already attached to both sides.
 * @example
 * ```typescript
 * const session = createConnectedPlayer({ server, connection, player });
 * await player.enable();
 * ```
 */
export const createConnectedPlayer = ({
    server,
    connection,
    player
}: {
    server: Server;
    connection: ClientConnection;
    player: Player;
}): PlayerSession => {
    const session = new PlayerSession(server, connection, player);

    player.attachNetworkSession(session);
    connection.attachPlayerSession(session);
    session.enable();

    return session;
};
