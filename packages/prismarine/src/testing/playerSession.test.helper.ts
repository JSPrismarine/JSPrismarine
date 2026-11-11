import type { Vector3 } from '@jsprismarine/math';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';

import type Server from '../Server';
import { entityIds } from '../entity/entityIds';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { StorePlayer } from '../entity/storePlayer';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import type ClientConnection from '../network/ClientConnection';
import PlayerSession from '../network/PlayerSession';
import type SessionManager from '../SessionManager';
import type { SessionPlayer, SessionPlayerRef, SessionPlayers } from '../network/sessionPlayers';
import type { World } from '../world/World';
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
 * @param ref - The id and identity the session holds, where the test reads them; the world the
 *   session puts its player in, an empty double by default; and whether the player has joined.
 * @returns The session.
 */
export const sessionFor = (
    server: Server,
    connection: ClientConnection,
    player: SessionPlayer,
    ref: Partial<SessionPlayerRef> & { readonly world?: World; readonly joined?: boolean } = {}
): PlayerSession => {
    const session = new PlayerSession(
        server,
        connection,
        { runtimeId: ref.runtimeId ?? -1n, identity: ref.identity ?? TESTER },
        sessionPlayerFields(player).players,
        ref.world ?? stub<World>()
    );
    // As `PlayerSession.join` leaves a player that finished joining.
    if (ref.joined === true) session['joined'] = true;
    return session;
};

/**
 * A session manager double.
 * @param members - The members the test needs.
 * @returns The double.
 */
export const sessionsWith = (members: StubMembers<SessionManager> = {}): SessionManager =>
    stub<SessionManager>(members);

/**
 * A store player as a login builds one and the session `createConnectedPlayer` joins it to, with
 * the player filed in the server's directory.
 * @param options - What the test builds the pair from.
 * @param options.server - The server double, which answers `getStorePlayers`.
 * @param options.connection - The connection double the session speaks through.
 * @param options.world - The world the login puts the player in.
 * @param options.eyes - Where the player's eyes are.
 * @param options.name - The player's name, `Steve` by default.
 * @param options.uuid - The login's UUID, a random one by default.
 * @param options.joined - Whether the player has finished joining, as `PlayerSession.join` leaves
 *   it; true by default.
 * @returns The session; its `getPlayer()` is the store player.
 */
export const connectedSession = ({
    server,
    connection,
    world,
    eyes,
    name = 'Steve',
    uuid = UUID.fromRandom(),
    joined = true
}: {
    server: Server;
    connection: ClientConnection;
    world: World;
    eyes: Vector3;
    name?: string;
    uuid?: UUID;
    joined?: boolean;
}): PlayerSession => {
    const player = new StorePlayer(entityIds.next(), { uuid, name, xuid: '' });
    player.standAt({ x: eyes.getX(), y: eyes.getY() - EYE_HEIGHT, z: eyes.getZ() });
    const identity = { name, xuid: '', uuid: player.getUUID().toString() };
    const session = createConnectedPlayer({ server, connection, player, identity, world });
    if (joined) session['joined'] = true;
    return session;
};
