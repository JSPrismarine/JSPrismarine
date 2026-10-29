import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import type { EventEmitter } from '../events/EventEmitter';
import RaknetDisconnectEvent from '../events/raknet/RaknetDisconnectEvent';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import Timer from '../utils/Timer';
import type ClientConnection from './ClientConnection';
import { takesConnection } from './handler/ConnectionPacketHandler';
import BatchPacket from './packet/BatchPacket';
import { readPacketId } from './packet/DataPacket';
import type { PacketLogFilter } from './PacketLogFilter';
import type PacketRegistry from './PacketRegistry';
import type { Transport, TransportConnection } from './transport/Transport';

/** What the dispatcher needs from each collaborator; the server wires its own parts in. */
export interface NetworkDispatcherOptions<C extends TransportConnection> {
    /** Where connections and frames come from. */
    transport: Transport<C>;
    /** The registry of live connections, keyed by transport token. */
    sessionManager: Pick<SessionManager, 'has' | 'add' | 'get' | 'remove'>;
    /** Resolves a packet class name to its handler; packets resolve through each connection's codec. */
    packetRegistry: Pick<PacketRegistry, 'getHandler'>;
    /** Where the legacy `raknetDisconnect` event still goes. */
    events: Pick<EventEmitter, 'emit'>;
    /** Handed to every packet handler; their contract takes the whole server. */
    server: Server;
    logger: Logger;
    /** Which packets the traffic log leaves out. */
    logFilter: PacketLogFilter;
    /** Builds the connection object the session registry holds for a transport connection. */
    createConnection: (connection: C) => ClientConnection;
    /** The query protocol's view of the transport's raw datagrams. */
    query: {
        /** Whether the query protocol is enabled at all; read per datagram. */
        enabled(): boolean;
        /** Answers one raw datagram. */
        onRaw(payload: Buffer, address: InetAddress): Promise<unknown>;
    };
}

/**
 * Routes what a {@link Transport} surfaces: admits connections into the session registry,
 * tears them down when the transport forgets them, and decodes each inbound frame as a batch
 * of packets dispatched to their registered handlers.
 *
 * Extracted verbatim from the closures `Server.bootstrap` used to install on the RakNet
 * listener; the behavior - duplicate-token rejection, the legacy `raknetDisconnect` event's
 * place in the teardown, and unknown-id warnings - is unchanged. The pre-login/post-login
 * handler split became the phase gate: each handler declares the session phases it
 * accepts, and a packet outside them is dropped.
 */
export default class NetworkDispatcher<C extends TransportConnection> {
    private readonly sessionManager: NetworkDispatcherOptions<C>['sessionManager'];
    private readonly packetRegistry: NetworkDispatcherOptions<C>['packetRegistry'];
    private readonly events: NetworkDispatcherOptions<C>['events'];
    private readonly server: Server;
    private readonly logger: Logger;
    private readonly logFilter: PacketLogFilter;
    private readonly createConnection: NetworkDispatcherOptions<C>['createConnection'];
    private readonly query: NetworkDispatcherOptions<C>['query'];

    public constructor(options: NetworkDispatcherOptions<C>) {
        this.sessionManager = options.sessionManager;
        this.packetRegistry = options.packetRegistry;
        this.events = options.events;
        this.server = options.server;
        this.logger = options.logger;
        this.logFilter = options.logFilter;
        this.createConnection = options.createConnection;
        this.query = options.query;

        options.transport.onConnect((connection) => this.handleConnect(connection));
        options.transport.onDisconnect((address, reason) => this.handleDisconnect(address, reason));
        options.transport.onFrame((payload, address) => this.handleFrame(payload, address));
        options.transport.onRaw((payload, address) => this.handleRaw(payload, address));
    }

    private handleConnect(connection: C): void {
        const token = connection.token;
        if (this.sessionManager.has(token)) {
            this.logger.error(`Another client with token (${token}) is already connected!`);
            connection.close('Already connected from another location');
            return;
        }

        const timer = new Timer();
        this.logger.debug(`${token} is attempting to connect`);
        this.sessionManager.add(token, this.createConnection(connection));
        this.logger.verbose(`New connection handling took §e${timer.stop()} ms§r`);
    }

    private async handleDisconnect(inetAddr: InetAddress, reason: string): Promise<void> {
        const time = Date.now();
        const token = inetAddr.toToken();

        // Claimed before anything is awaited. RakNet frees the address the instant it
        // forgets a session, and both this handler and the check in `handleConnect` key
        // on the token, so leaving the entry in place across the awaits below left a
        // window in which a client reconnecting from the same port was turned away as
        // "already connected" - and the tear-down that then ran released the connection
        // that had just replaced it.
        const session = this.sessionManager.get(token);
        this.sessionManager.remove(token);

        // Read before the tear-down below, which detaches the session and takes the
        // player out of its world. A player is only added to a world once the client
        // reports itself initialised, so a session whose player is not in one belongs
        // to a client that gave up between login and spawn.
        const player = session?.getPlayerSession()?.getPlayer() ?? null;
        const spawned = player !== null && player.getWorld().getEntity(player.getRuntimeId()) === player;

        const event = new RaknetDisconnectEvent(inetAddr, reason);
        await this.events.emit('raknetDisconnect', event);

        if (!session) {
            this.logger.info(`${token} disconnected due to ${reason}`);
            return;
        }

        await session.closePlayerSession();

        // A spawned player announces its own departure in chat. For one that never got
        // that far this line is the only trace the connection leaves, so it is kept at a
        // level the default console shows.
        if (spawned) this.logger.debug(`${token} disconnected due to ${reason}`);
        else {
            const who = player === null ? token : `${player.getName()} (${token})`;
            this.logger.info(`${who} disconnected during the join due to ${reason}`);
        }
        this.logger.debug(`Player destruction took about ${Date.now() - time} ms`);
    }

    private async handleFrame(payload: Buffer, inetAddr: InetAddress): Promise<void> {
        let connection: ClientConnection | null;
        if ((connection = this.sessionManager.get(inetAddr.toToken()) ?? null) === null) {
            this.logger.error(`Got a packet from a closed connection (${inetAddr.toToken()})`);
            return;
        }

        try {
            // Read batch content and handle them
            const batched = new BatchPacket(payload);
            batched.compressed = connection.hasCompression;

            // Read all packets inside batch and handle them
            for (const buf of await batched.asyncDecode()) {
                const pid = readPacketId(buf);

                // Resolved through the codec this connection negotiated, so each session
                // decodes with the id layout of its own protocol version.
                const packet = connection.codec.createPacket(pid, buf);
                if (packet === null) {
                    this.logger.warn(`Packet 0x${pid.toString(16)} isn't implemented`);
                    continue;
                }

                try {
                    packet.decode();
                } catch (error: unknown) {
                    this.logger.error(error);
                    this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${error}`);
                    continue;
                }

                try {
                    const handler = this.packetRegistry.getHandler(packet.getName());
                    if (this.logFilter.shouldLog(packet))
                        this.logger.silly(`Received §b${packet.constructor.name}§r packet`);

                    // The phase gate: a handler runs only in the phases it declared. A
                    // retail client routinely races the next step - `ClientCacheStatus`
                    // lands while the login is still being handled - so the drop is a
                    // debug line, as it was when the same packets were dropped for
                    // arriving "before login completed".
                    if (!handler.phases.includes(connection.phase)) {
                        this.logger.debug(
                            `Dropped §b${packet.constructor.name}§r: not accepted in the ${connection.phase} phase`
                        );
                        continue;
                    }

                    // A handshake- or login-phase handler takes the bare connection; every
                    // other handler needs the player session that login creates. A packet
                    // that reaches the wrong side of that line is dropped rather than
                    // handed an object of the wrong shape.
                    const session = connection.getPlayerSession();
                    if (takesConnection(handler)) await handler.handle(packet, this.server, connection);
                    else if (session !== null) await handler.handle(packet, this.server, session);
                    else this.logger.debug(`Dropped §b${packet.constructor.name}§r: received before login completed`);
                } catch (error: unknown) {
                    this.logger.error(`Handler error ${packet.constructor.name}-handler: (${error})`);
                    this.logger.error(error);
                }
            }
        } catch (error: unknown) {
            this.logger.error(error);
        }
    }

    private async handleRaw(payload: Buffer, inetAddr: InetAddress): Promise<void> {
        if (!this.query.enabled()) return;

        try {
            await this.query.onRaw(payload, inetAddr);
        } catch (error: unknown) {
            this.logger.verbose(`QueryManager encountered an error`);
            this.logger.error(error);
        }
    }
}
