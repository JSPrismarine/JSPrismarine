/**
 * What a packet handler of a connection that has no player session yet is handed in place of
 * the `Server`
 * ([ADR 0014](../../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * Three handlers run before a session exists: the network settings, the login and the encryption
 * handshake. Each takes the connection the packet arrived on, a logger, the settings they read
 * and the services a login uses. The login's work that reaches a world, which is reading the
 * default world's spawn, building the player and loading its record, is
 * {@link JoinPreparation.prepare}. It runs in the connection layer in front of the join, as
 * ADR 0014 places login I/O, and its result is a session whose player is in no world yet. That
 * player enters its world as an input, when `SetLocalPlayerAsInitialized` adds it.
 */
import type { LaneHandler } from '@jsprismarine/protocol/handler/PacketHandler';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import type BanManager from '../../ban/BanManager';
import type { Config } from '../../config/Config';
import type SessionManager from '../../SessionManager';
import type ClientConnection from '../ClientConnection';
import type { parseLoginIdentity } from '../LoginIdentity';
import type PlayerSession from '../PlayerSession';
import type { PlayerIdentity } from '../../playerIdentity';
import type { SessionPhase } from '../SessionPhase';
import type { HandlerLog } from './HandlerContext';

/** The phases a connection passes through before its login becomes a player session. */
export type ConnectionPhase = Extract<SessionPhase, 'handshake' | 'login' | 'encryption'>;

/** What a login claims about its player, once the claims are verified when they can be. */
export type LoginIdentity = ReturnType<typeof parseLoginIdentity>;

/**
 * The account a login names, in the form `SessionManager` compares and a session holds.
 *
 * @param identity - Who the login names.
 */
export const accountOf = (identity: LoginIdentity): PlayerIdentity => ({
    name: identity.displayName,
    xuid: identity.xuid,
    uuid: UUID.fromString(identity.identity).toString()
});

/** The server settings a handler before the session may read. */
export type ConnectionConfig = Pick<
    Config,
    'getPacketCompressionAlgorithm' | 'getPacketCompressionThreshold' | 'getMaxPlayers' | 'getOnlineMode'
>;

/** Builds a login's player in front of its join. */
export interface JoinPreparation {
    /**
     * Builds the player of a login that holds its account and joins it to the connection: reads
     * the default world's spawn, builds the store player standing there, attaches a session for
     * it and loads its record, which may move it to the world the record names. Sends nothing.
     *
     * @param connection - The connection logging in.
     * @param identity - Who the login names.
     * @returns The session, or null when a later login of the same account took it while the
     *   spawn was read.
     * @throws The error loading the record threw, after the session is torn down again.
     */
    prepare(connection: ClientConnection, identity: LoginIdentity): Promise<PlayerSession | null>;
}

/** The server-wide services a login uses. */
export interface LoginServices {
    /** The live connections and the accounts their logins hold. */
    readonly sessions: Pick<SessionManager, 'getSessions' | 'reserveIdentity' | 'holdsIdentity' | 'claimIdentity'>;
    /** The ban list. */
    readonly bans: Pick<BanManager, 'isBanned'>;
    /** Where a login's player is built. */
    readonly players: JoinPreparation;
    /**
     * Takes a replaced connection's player out as that connection's next input, behind every
     * input its client sent first, as a transport disconnect does. Kicked from the connection
     * lane instead, the player left at once and the input step dropped what its client had
     * already sent, so the record the new login reads lacked it.
     *
     * @param connection - The connection being replaced; its inputs are held under it.
     * @param remove - Starts the removal, and takes the player out before it first awaits, as
     *   `PlayerSession.kick` does.
     * @returns Settles once the input step that applied the removal is over and the removal has
     *   finished.
     */
    removeAsInput(connection: ClientConnection, remove: () => Promise<void>): Promise<void>;
}

/** What a handler of a connection with no player session is handed. */
export interface ConnectionContext {
    /** The connection the packet arrived on. */
    readonly connection: ClientConnection;
    /** Where the handler logs. */
    readonly log: HandlerLog;
    /** The settings the handler may read. */
    readonly config: ConnectionConfig;
    /** The services a login uses. */
    readonly login: LoginServices;
}

/**
 * A handler of a packet that arrives before the connection has a player session. It runs in the
 * connection lane, when its packet arrives, and names only phases in which no session exists.
 */
export interface ConnectionHandler<P> extends LaneHandler<P, ConnectionContext, 'connection', ConnectionPhase> {}

const CONNECTION_PHASES: ReadonlySet<SessionPhase> = new Set<ConnectionPhase>(['handshake', 'login', 'encryption']);

/**
 * Whether a registered handler takes a {@link ConnectionContext} rather than a player session's.
 *
 * Derived from the handler's declared phases: a session is attached when a connection leaves
 * the `login` phase, so a handler whose phases all precede that point is one written against the
 * bare connection.
 *
 * @param handler - Any handler the registry holds.
 */
export const takesConnection = <P>(
    handler: ConnectionHandler<P> | { readonly phases: readonly SessionPhase[] }
): handler is ConnectionHandler<P> => handler.phases.every((phase) => CONNECTION_PHASES.has(phase));
