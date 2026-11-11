import type Server from '../Server';
import type ClientConnection from '../network/ClientConnection';
import PlayerSession from '../network/PlayerSession';
import type SessionManager from '../SessionManager';
import { LegacyPlayers } from '../network/sessionPlayers';
import type { SessionPlayer, SessionPlayerRef, SessionPlayers } from '../network/sessionPlayers';
import type { StubMembers } from './stub.test.helper';
import { stub } from './stub.test.helper';
import type { PlayerIdentity } from '../playerIdentity';

/** The identity a session double holds unless a test names another. */
const TESTER: PlayerIdentity = { name: 'Tester', xuid: '', uuid: '00000000-0000-0000-0000-000000000000' };

/**
 * The fields a session holds of its player, for a double built from `PlayerSession.prototype`
 * with `Object.assign`.
 * @param player - The player double the session speaks for, which it finds whatever id it asks for.
 * @param runtimeId - The id the session holds, the player double's own where it has one.
 * @returns The id, the identity and the directory, under the session's field names.
 */
export const sessionPlayerFields = <P>(
    player: P,
    runtimeId = -1n
): { runtimeId: bigint; identity: PlayerIdentity; players: SessionPlayers<P> } => ({
    runtimeId,
    identity: TESTER,
    players: { of: () => player, delete: () => true }
});

/**
 * A session that speaks for a player double, which it finds whatever id it asks for.
 *
 * A real session finds its player in the server's directory by entity id. A double built with
 * `stub` often has no id, so the session holds `ref.runtimeId`, -1 by default, which no test
 * entity has.
 * @param server - The server double.
 * @param connection - The connection double.
 * @param player - The player double the session speaks for.
 * @param ref - The id and identity the session holds, where the test reads them.
 * @returns The session.
 */
export const sessionFor = (
    server: Server,
    connection: ClientConnection,
    player: SessionPlayer,
    ref: Partial<SessionPlayerRef> = {}
): PlayerSession =>
    new PlayerSession(
        server,
        connection,
        { runtimeId: ref.runtimeId ?? -1n, identity: ref.identity ?? TESTER },
        sessionPlayerFields(player).players
    );

/**
 * A session manager double with a real player directory, which `createConnectedPlayer` files
 * the player in and the session finds it in.
 * @param members - Any other members the test needs.
 * @returns The double, which answers with the same directory every time.
 */
export const sessionsWith = (members: StubMembers<SessionManager> = {}): SessionManager => {
    const players = new LegacyPlayers();
    return stub<SessionManager>({ getLegacyPlayers: () => players, ...members });
};
