/**
 * Where the server builds the context of a handler that runs before a connection has a player
 * session, and the login's preparation of the player in front of its join
 * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * It sits outside `network/handler/`, which is meant to import no `Server` at all once every
 * handler has moved to a context.
 */
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import { entityIds } from '../entity/entityIds';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { StorePlayer } from '../entity/storePlayer';
import { currentTickWaitTracker } from '../world/TickWaits';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';
import { playerKeyOf } from '../playerIdentity';
import type Server from '../Server';
import type { World } from '../world/World';
import type ClientConnection from './ClientConnection';
import { createConnectedPlayer } from './createConnectedPlayer';
import type { ConnectionContext, JoinOptions, JoinPreparation, LoginServices } from './handler/ConnectionContext';
import { InputQueue } from './InputQueue';
import { accountLinksToken } from '../modules/tokens';

/**
 * The world a joining player is built in: the Overworld of the attached level they last left
 * from, or the entry level's.
 */
export const returningWorldOf = (server: Server, playerKey: string): World => {
    const worlds = server.getWorldManager();
    return worlds.returningLevelOf(playerKey)?.loadedWorld(OVERWORLD_STEM_ID) ?? worlds.getEntryWorld();
};

/** The login's preparation of a player, in the level they left from or the entry level. */
const joinPreparationOf = (server: Server): JoinPreparation => ({
    async prepare(connection, account, { dress, presenterOf }: JoinOptions = {}) {
        // Resolved here because this is where a world is first available and awaiting is
        // allowed. An entity has to be given somewhere to be, so there is no longer a moment
        // where one exists at the origin waiting to be told where it really is.
        const links = server.getKernel().get(accountLinksToken);
        if (account.linkedFrom === undefined) await links.noteLogin(account);
        // A player who logged out in another level comes back in it, and anyone else in the
        // entry level; the level's record then puts them in the dimension they left.
        const world = returningWorldOf(server, playerKeyOf(account));
        const spawn = await world.getSpawnPosition();
        // The entity id is drawn here, and the store player enters a store only at
        // `SetLocalPlayerAsInitialized`. Built inert: nothing server-wide hears of it until it is
        // filed below, so a login rejected before then leaves nothing behind.
        const player = new StorePlayer(entityIds.next(), { ...account, uuid: UUID.fromString(account.uuid) });
        await dress?.(player);
        // The spawn is where the eyes go, as a client reports its position.
        player.standAt({ x: spawn.getX(), y: spawn.getY() - EYE_HEIGHT, z: spawn.getZ() });

        // A login of the same account after this one took it while the spawn was read. That one
        // waits for this join to settle and then disconnects this connection, which has no
        // player to save yet.
        if (!server.getSessionManager().holdsIdentity(connection)) return null;

        // Joined to its connection only once it is going to be let in, and torn down as a
        // pair if the join itself fails - otherwise the session would keep its place in the
        // chunk rotation with nothing on the other end of it.
        //
        // `join` sends nothing. Until the client has `PlayStatus(LoginSuccess)` it is still
        // logging in, and a retail client handed a game packet in that state drops the
        // connection with `InitialConnection-90`.
        const session = createConnectedPlayer({
            server,
            connection,
            player,
            identity: account,
            world,
            ...(presenterOf === undefined ? {} : { presenter: presenterOf(player) })
        });
        try {
            await session.join();
        } catch (error: unknown) {
            await connection.closePlayerSession();
            throw error;
        }
        return session;
    }
});

/** One server's contexts for the handlers that run before a session exists. */
export class ConnectionContexts {
    private static readonly built = new WeakMap<Server, ConnectionContexts>();

    private readonly server: Server;
    private readonly players: JoinPreparation;

    private constructor(server: Server) {
        this.server = server;
        this.players = joinPreparationOf(server);
    }

    /**
     * The contexts of one server, built the first time they are asked for.
     *
     * @param server - The server the contexts read.
     */
    public static of(server: Server): ConnectionContexts {
        let contexts = ConnectionContexts.built.get(server);
        if (contexts === undefined) {
            contexts = new ConnectionContexts(server);
            ConnectionContexts.built.set(server, contexts);
        }
        return contexts;
    }

    /**
     * The context of a handler for a packet that arrived on a connection. The server's parts are
     * read when the handler uses them, not when the context is built.
     *
     * @param connection - The connection the packet arrived on.
     * @param inputs - Where the dispatcher holds inputs, which a login's replacement of another
     *   connection waits in. Without one, the replacement is applied at once, as on a server with
     *   no input step.
     */
    public contextOf(connection: ClientConnection, inputs = new InputQueue(() => false)): ConnectionContext {
        const server = this.server;
        const login = this.loginServices(inputs);
        return {
            connection,
            get log() {
                return server.getLogger();
            },
            get config() {
                return server.getConfig();
            },
            get protocols() {
                return server.getProtocolPolicy();
            },
            login
        };
    }

    /**
     * What a login of either edition reads and claims: the sessions, the lists, the account links
     * and where its player is built.
     *
     * @param inputs - Where the dispatcher holds inputs, as for {@link ConnectionContexts.contextOf}.
     */
    public loginServices(inputs = new InputQueue(() => false)): LoginServices {
        const server = this.server;
        return {
            get sessions() {
                return server.getSessionManager();
            },
            get bans() {
                return server.getBanManager();
            },
            get allowList() {
                return server.getAllowList();
            },
            get permissions() {
                return server.getPermissionManager();
            },
            get links() {
                return server.getKernel().get(accountLinksToken);
            },
            players: this.players,
            async removeAsInput(replaced, remove) {
                let removed: Promise<void> = Promise.resolve();
                const held = inputs.hold(replaced, () => {
                    removed = remove();
                });
                // Waiting only for an input step, which a harness that steps the ticks has to
                // run: parked, so its wait for quiet counts this login as waiting for the tick.
                // A shutdown applies every held input, so the park is always released.
                const tracker = currentTickWaitTracker();
                tracker?.park();
                try {
                    await held;
                } finally {
                    tracker?.unpark();
                }
                await removed;
            }
        };
    }
}
