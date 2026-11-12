import type ClientConnection from './network/ClientConnection';
import type PlayerSession from './network/PlayerSession';
import type { SessionPlayer } from './network/sessionPlayers';
import type { ConnectionId } from './network/transport/ConnectionId';
import type { PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';
import type { PlayerIdentity } from './playerIdentity';
import { sameAccount } from './playerIdentity';

/** A connection whose login named an account, and the join it is running for it, if any. */
interface LoginClaim {
    readonly identity: PlayerIdentity;
    /** Settles when the connection's join has finished or failed; null until the join starts. */
    joined: Promise<void> | null;
}

/** Another connection holding the account a login claims, which the login has to replace. */
export interface ReplacedLogin {
    readonly connection: ClientConnection;
    /** Settles when that connection's join has finished or failed; null when it has not started. */
    readonly joined: Promise<void> | null;
}

export default class SessionManager {
    private readonly connections: Map<ConnectionId, ClientConnection> = new Map();
    private readonly playerList: Map<string, PlayerListEntry> = new Map();

    /**
     * The account each logging-in or live connection holds, so that a login can find the other
     * connection holding the same one whatever phase it is in. `getAllPlayers` sees only players
     * who finished `PlayerSession.join`, which is what let two live players share one account.
     */
    private readonly claims: Map<ClientConnection, LoginClaim> = new Map();

    public add(id: ConnectionId, connection: ClientConnection): void {
        this.connections.set(id, connection);
    }

    public has(id: ConnectionId): boolean {
        return this.connections.has(id);
    }

    public get(id: ConnectionId): ClientConnection | null {
        return this.connections.get(id) ?? null;
    }

    public remove(id: ConnectionId): boolean {
        const connection = this.connections.get(id);
        if (connection !== undefined) this.claims.delete(connection);
        return this.connections.delete(id);
    }

    /**
     * Records that a login on `connection` names `identity`, without replacing anybody.
     *
     * Called once the login has passed the checks that need no world, before the encryption
     * handshake, so that a later login of the same account finds this one while it waits for the
     * client's answer. A login refused later never displaces anybody: only
     * {@link SessionManager.claimIdentity} does.
     * @param connection - The connection logging in.
     * @param identity - The account its login names.
     */
    public reserveIdentity(connection: ClientConnection, identity: PlayerIdentity): void {
        this.claims.set(connection, { identity, joined: null });
    }

    /**
     * Whether `connection` still holds the account it reserved, which it stops doing when a later
     * login of the same account replaces it.
     * @param connection - The connection logging in.
     * @returns False once another login has taken the account, or when it never reserved one.
     */
    public holdsIdentity(connection: ClientConnection): boolean {
        return this.claims.has(connection);
    }

    /**
     * Takes `identity` for `connection` and hands back every other connection that holds the same
     * account, so the caller can disconnect them.
     *
     * A match is any connection that reserved a matching account, at any phase from the login to
     * the spawn, and any connection whose player matches, for a player that joined without a
     * reservation. Each match loses its reservation here, so its own login stops at its next
     * {@link SessionManager.holdsIdentity} check.
     * @param connection - The connection whose login is being let in.
     * @param identity - The account its login names.
     * @param joined - Settles when this connection's join has finished or failed.
     * @returns The connections to replace, oldest reservation first.
     */
    public claimIdentity(
        connection: ClientConnection,
        identity: PlayerIdentity,
        joined: Promise<void>
    ): ReplacedLogin[] {
        const replaced: ReplacedLogin[] = [];
        for (const [other, claim] of this.claims) {
            if (other === connection || !sameAccount(claim.identity, identity)) continue;
            replaced.push({ connection: other, joined: claim.joined });
            this.claims.delete(other);
        }

        for (const other of this.connections.values()) {
            if (other === connection || this.claims.has(other)) continue;
            if (replaced.some((entry) => entry.connection === other)) continue;
            const session = other.getPlayerSession();
            if (session !== null && sameAccount(session.identity, identity)) {
                replaced.push({ connection: other, joined: null });
            }
        }

        this.claims.set(connection, { identity, joined });
        return replaced;
    }

    public getPlayerList(): Map<string, PlayerListEntry> {
        return this.playerList;
    }

    /**
     * Every player on the server, in any world.
     *
     * Online only, the same test `World.getViewers` applies. A connection has a session from
     * the moment it authenticates, well before the client is ready to be sent anything, and
     * without this the login handshake was among the recipients of every broadcast.
     * @returns {SessionPlayer[]} The online players' store players, in the order of
     *   {@link SessionManager.getSessions}.
     */
    public getAllPlayers(): SessionPlayer[] {
        return this.getSessions().map((session) => session.getPlayer());
    }

    /**
     * The sessions of every online player on the server, in any world: the sessions of the
     * players {@link SessionManager.getAllPlayers} lists, in the same order. A session is
     * online while {@link PlayerSession.isConnected} says so.
     * @returns The sessions.
     */
    public getSessions(): PlayerSession[] {
        const sessions: PlayerSession[] = [];
        for (const connection of this.connections.values()) {
            const session = connection.getPlayerSession();
            if (session?.isConnected()) sessions.push(session);
        }
        return sessions;
    }

    /**
     * The session of the online player with entity id `id`.
     * @param id - The player's entity id, which its session holds.
     * @returns The session, or null when no online player has that id.
     */
    public sessionOf(id: bigint): PlayerSession | null {
        // Walks the connections in place rather than through `getSessions`: chat looks a
        // recipient up once per delivery, and a broadcast would build one array per recipient.
        for (const connection of this.connections.values()) {
            const session = connection.getPlayerSession();
            if (session?.runtimeId === id && session.isConnected()) return session;
        }
        return null;
    }

    /**
     * The session of the online player whose login named this name or XUID, matched against
     * the identity each session holds.
     *
     * Sees only players who finished joining, as {@link SessionManager.findPlayer} does.
     * @param query - The name or XUID to look for.
     * @param query.name - The display name.
     * @param query.xuid - The Xbox Live id. An empty one names no account and matches nobody.
     * @returns The session, or null when no online player matches.
     */
    public findSession({ name, xuid }: { name?: string; xuid?: string }): PlayerSession | null {
        return (
            this.getSessions().find(
                ({ identity }) =>
                    identity.name === name || (xuid !== undefined && xuid !== '' && identity.xuid === xuid)
            ) ?? null
        );
    }

    /**
     * Kick all players.
     * @param {string} reason - The reason to kick the players.
     */
    public async kickAllPlayers(reason: string) {
        await Promise.all(this.getSessions().map((session) => session.kick(reason)));
    }

    /**
     * The online player with this name or XUID.
     *
     * Sees only players who finished joining. A login looks for the sessions it replaces through
     * {@link SessionManager.claimIdentity} instead, which also sees one still joining.
     * @param query - The name or XUID to look for.
     * @param query.name - The display name.
     * @param query.xuid - The Xbox Live id.
     * @returns The player, or null when no online player matches.
     */
    public findPlayer(query: { name?: string; xuid?: string }): SessionPlayer | null {
        return this.findSession(query)?.getPlayer() ?? null;
    }

    /**
     * Just a compatibility layer to not break everything for now
     *
     * @deprecated
     * @param name
     * @returns
     */
    public getPlayerByExactName(name: string): SessionPlayer | null {
        return this.findSession({ name })?.getPlayer() ?? null;
    }

    /**
     * The online player with runtime id `id`.
     *
     * Null when nobody has it, as the signature always said. It used to assert instead, so
     * asking after a player who had just left took the caller down with it.
     *
     * @deprecated
     * @param id - The runtime id to look up.
     * @returns The player, or null when no online player has that id.
     */
    public getPlayerById(id: bigint): SessionPlayer | null {
        return this.sessionOf(id)?.getPlayer() ?? null;
    }
}
