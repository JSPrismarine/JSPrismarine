import { isIPv4 } from 'node:net';

import type { Module } from '@jsprismarine/kernel';
import { RakNetListener, ServerName, WorkerServerSocket } from '@jsprismarine/raknet';
import type { RakNetListenerLike } from '@jsprismarine/raknet';
import {
    constrainIcePorts,
    HttpSignaling,
    joinStatusJson,
    NETHERNET_LAN_PORT,
    NetherNetIdentity,
    parseUdpPorts,
    withMappedCandidates
} from '@jsprismarine/nethernet';
import { Server as NetherNetServer } from 'nethernet';

import ClientConnection from '../network/ClientConnection';
import type { InboundPacketRecord, InboundPacketRecorder } from '../network/InboundPacketTrace';
import type { OutboundPacketRecorder } from '../network/OutboundPacketTrace';
import NetworkDispatcher from '../network/NetworkDispatcher';
import { QueryResponder } from '../network/query/QueryResponder';
import type { QueryStatus } from '../network/query/QueryResponder';
import { QuerySocket } from '../network/query/QuerySocket';
import { advertiseOnLan } from '../network/nethernet/advertiseOnLan';
import { NETHERNET_IDENTITY_FILE } from '../network/nethernet/NetherNetDefaults';
import { netherNetStatusOf } from '../network/nethernet/netherNetStatusOf';
import type { ConnectionId, ConnectionIds } from '../network/transport/ConnectionId';
import MultiTransport from '../network/transport/MultiTransport';
import NetherNetTransport from '../network/transport/NetherNetTransport';
import RakNetTransport from '../network/transport/RakNetTransport';
import type { Transport, TransportConnection } from '../network/transport/Transport';
import { latestCodec } from '../network/codec/CodecRegistry';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';
import { networkToken } from './tokens';

/** The IPv4 bind address meaning every interface, which is what turns on the IPv6 listener too. */
const IPV4_WILDCARD = '0.0.0.0';
/** Every IPv6 interface, where the IPv6 listener binds. */
const IPV6_WILDCARD = '::';

/**
 * What the `prismarine:network` token resolves to: the server's network front
 * door. The listener binds when {@link Networking.start} is called — the bind
 * address and port arrive with `Server.bootstrap`, after the kernel has started
 * — and stays up across a `Server.reload`; only {@link Networking.kill} takes
 * it down.
 */
export interface Networking {
    /**
     * Binds every enabled transport and wires inbound traffic to the packet dispatcher.
     * @param address - The address to bind.
     * @param port - The port to bind.
     * @throws {Error} When the config enables no transport, so no client could connect.
     */
    start(address: string, port: number): void;

    /** Replays one accepted packet through the connected session's handler path. */
    replayInboundRecord?(record: InboundPacketRecord, tickOffset?: number): Promise<void>;

    /**
     * Closes every transport, dropping every session with them. A no-op before
     * {@link Networking.start}, so an early shutdown has nothing to do here.
     */
    kill(): void;

    /**
     * The RakNet listener, for what the transport seam does not cover: the query protocol's
     * replies go out through its socket.
     * @returns The listener, or undefined before {@link Networking.start} or with RakNet off.
     */
    getListener(): RakNetListenerLike | undefined;

    /**
     * What every transport advertises about the server: MOTD, version and player counts.
     * @returns The server name, or undefined before {@link Networking.start}.
     */
    getServerName(): ServerName | undefined;

    /** Hands worker-delivered network records to the game thread at the start of a tick. */
    pollInbound(): number;
}

/**
 * The server's {@link Networking}: owns the transports the config enables and, once
 * started, the `NetworkDispatcher` routing their traffic through one `MultiTransport`.
 * Construction does no I/O, so the instance is safe to build and provide before anything
 * binds.
 */
export class ServerNetworking implements Networking {
    private raknet: RakNetListenerLike | undefined;
    /** The IPv6 RakNet listener beside {@link raknet}; set while a wildcard-bound server listens on IPv6. */
    private raknetV6: RakNetListenerLike | undefined;
    private serverName: ServerName | undefined;
    private transport: Transport | undefined;
    private dispatcher: NetworkDispatcher<TransportConnection> | undefined;
    /** Stops keeping the LAN advertisement current; set while the server advertises on the LAN. */
    private stopLanAdvertisement: (() => void) | undefined;
    /** NetherNet's HTTP signaling on the game port's TCP side; set while NetherNet is on. */
    private signaling: HttpSignaling | undefined;
    /** The query protocol's own socket; set while query answers on a port RakNet does not hold. */
    private querySocket: QuerySocket | undefined;
    /** Every connection the transports have announced and not yet withdrawn. */
    private readonly liveConnections = new Set<ConnectionId>();

    /**
     * @param server - The server whose sessions and handlers the dispatcher drives.
     * @param inboundPacketRecorder - Opt-in sink for accepted inbound packets.
     * @param outboundPacketRecorder - Opt-in sink for clientbound packets.
     * @param givenTransport - A transport to listen on instead of the ones the config enables,
     *   such as an in-process loopback for a replay. The server then binds no socket: no RakNet,
     *   NetherNet or query listener.
     */
    public constructor(
        private readonly server: Server,
        private readonly inboundPacketRecorder?: InboundPacketRecorder,
        private readonly outboundPacketRecorder?: OutboundPacketRecorder,
        private readonly givenTransport?: Transport
    ) {}

    /** Binds every enabled transport, or takes the given one, and subscribes the packet dispatcher. */
    public start(address: string, port: number): void {
        const server = this.server;
        const config = server.getConfig();
        this.serverName = new ServerName(server, latestCodec);
        // Players arrive over every transport, so RakNet's sessions are not the count; see countConnection.
        this.serverName.ownPlayerCount();

        const serverName = this.serverName;
        const rakNet: RakNetTransport[] = [];
        this.transport =
            this.givenTransport ??
            new MultiTransport((ids) => {
                const transports: Transport[] = [];
                if (config.getEnableRakNet()) {
                    rakNet.push(this.startRakNet(address, port, serverName, ids));
                    if (address === IPV4_WILDCARD) rakNet.push(this.startRakNetV6(serverName, ids));
                    transports.push(...rakNet);
                }
                if (config.getEnableNetherNet()) transports.push(this.startNetherNet(address, port, serverName, ids));
                if (transports.length === 0) {
                    throw new Error(
                        'No transport is enabled: turn on enable-raknet or enable-nethernet in config.json'
                    );
                }
                return transports;
            });

        // The dispatcher subscribes itself; holding it is unnecessary, the transport keeps
        // it alive through the listeners it installed.
        this.dispatcher = new NetworkDispatcher({
            transport: this.transport,
            sessionManager: server.getSessionManager(),
            packetHandlerRegistry: server.getPacketHandlerRegistry(),
            events: server,
            server,
            logger: server.getLogger(),
            logFilter: server.getPacketLogFilter(),
            inboundPacketRecorder: this.inboundPacketRecorder,
            outboundPacketRecorder: this.outboundPacketRecorder,
            createConnection: (connection) =>
                new ClientConnection(
                    connection,
                    server.getLogger(),
                    server.getPacketLogFilter(),
                    () => server.getConfig().getPacketCompressionLevel(),
                    () => server.getConfig().getPacketCompressionThreshold()
                )
        });
        if (this.givenTransport === undefined && config.getEnableQuery())
            this.startQuery(address, port, serverName, rakNet);

        // After the dispatcher, so the count changes once a connection is registered or released.
        // Counted here rather than per transport: every transport advertises the same total.
        this.transport.onConnect((connection) => this.countConnection(serverName, connection.id, true));
        this.transport.onDisconnect((id) => this.countConnection(serverName, id, false));
    }

    /**
     * Replays an accepted packet after the caller restores its session and advances the tick.
     *
     * @throws {Error} Before the listener starts, or when the dispatcher rejects the record.
     */
    public async replayInboundRecord(record: InboundPacketRecord, tickOffset = 0): Promise<void> {
        const dispatcher = this.dispatcher;
        if (dispatcher === undefined) throw new Error('Cannot replay a packet before networking starts');
        await dispatcher.replayInboundRecord(record, tickOffset);
    }

    /** Closes every transport that was started. */
    public kill(): void {
        this.stopLanAdvertisement?.();
        this.stopLanAdvertisement = undefined;
        this.signaling?.close();
        this.signaling = undefined;
        this.querySocket?.close();
        this.querySocket = undefined;
        this.transport?.close();
    }

    /** The RakNet listener, or undefined before {@link ServerNetworking.start} or with RakNet off. */
    public getListener(): RakNetListenerLike | undefined {
        return this.raknet;
    }

    /** The advertised server name, or undefined before {@link ServerNetworking.start}. */
    public getServerName(): ServerName | undefined {
        return this.serverName;
    }

    /** Drains worker events in queue order; socket mode already delivers on the event loop. */
    public pollInbound(): number {
        let delivered = 0;
        for (const raknet of [this.raknet, this.raknetV6]) {
            if (raknet instanceof WorkerServerSocket) delivered += raknet.pollInbound();
        }
        return delivered;
    }

    /** Binds the RakNet listener, on a worker thread when the config says so. */
    private startRakNet(address: string, port: number, serverName: ServerName, ids: ConnectionIds): RakNetTransport {
        const raknet = this.createRakNetListener(serverName);
        raknet.start(address, port);
        this.raknet = raknet;
        return new RakNetTransport(raknet, this.server, ids);
    }

    /**
     * Binds the second RakNet listener a wildcard-bound server runs, on every IPv6 interface and
     * `server-portv6`, as Bedrock Dedicated Server does. A port another program holds costs IPv6
     * clients their way in, with a warning, not the server.
     */
    private startRakNetV6(serverName: ServerName, ids: ConnectionIds): RakNetTransport {
        const config = this.server.getConfig();
        const logger = this.server.getLogger();
        const port = config.getServerPortV6();
        const raknet = this.createRakNetListener(serverName);
        raknet.on('error', (error) =>
            logger.warn(`IPv6 clients cannot join: UDP port ${port} is unavailable (${error.message})`)
        );
        raknet.start(IPV6_WILDCARD, port);
        this.raknetV6 = raknet;
        return new RakNetTransport(raknet, this.server, ids);
    }

    /**
     * Starts answering the query protocol. A `query-port` equal to `port` answers on the RakNet
     * listeners beside the game, as Bedrock servers have always done, since query datagrams
     * never look like RakNet's; with RakNet off, or on any other port, query gets a socket of its
     * own. `enable-query` is read again per datagram, so a reload that turns it off silences it.
     */
    private startQuery(address: string, port: number, serverName: ServerName, rakNet: RakNetTransport[]): void {
        const server = this.server;
        const config = server.getConfig();
        const status = (): QueryStatus => ({
            motd: serverName.getMotd(),
            version: serverName.getVersion(),
            software: `JSPrismarine ${server.getVersion()}`,
            map: config.getLevelName(),
            onlinePlayers: serverName.getOnlinePlayerCount(),
            maxPlayers: serverName.getMaxPlayerCount(),
            hostPort: serverName.getPort(),
            hostIp: address,
            players: server
                .getSessionManager()
                .getAllPlayers()
                .map((player) => player.getName())
        });
        const responder = new QueryResponder(() => status());
        const answer = (datagram: Buffer, from: string, fromPort: number): Buffer | undefined =>
            server.getConfig().getEnableQuery() ? responder.respond(datagram, from, fromPort) : undefined;

        const shared = config.getQueryPort() === config.getServerPort();
        if (shared && rakNet.length > 0) {
            for (const transport of rakNet) {
                transport.onRaw((datagram, from) => {
                    const reply = answer(datagram, from.getAddress(), from.getPort());
                    if (reply !== undefined) transport.sendRaw(reply, from);
                });
            }
            return;
        }

        const querySocket = new QuerySocket(
            { respond: (datagram, from, fromPort) => answer(datagram, from, fromPort) },
            server.getLogger()
        );
        this.querySocket = querySocket;
        const queryPort = shared ? port : config.getQueryPort();
        void querySocket.start(address, queryPort).then((bound) => {
            if (bound !== undefined) server.getLogger().info(`Answering query on UDP port ${bound}`);
        });
    }

    /** An unstarted RakNet listener on the shared server name, on a worker thread when the config says so. */
    private createRakNetListener(serverName: ServerName): RakNetListenerLike {
        const config = this.server.getConfig();
        const logger = this.server.getLogger();
        return config.getUseRakNetWorker()
            ? new WorkerServerSocket(config.getMaxPlayers(), config.getOnlineMode(), serverName, logger)
            : new RakNetListener(config.getMaxPlayers(), config.getOnlineMode(), serverName, logger);
    }

    /**
     * Starts the `nethernet` server and the two ways offers reach it. HTTP signaling on the game
     * port's TCP side serves clients joining by address. With LAN visibility on, UDP 7551 serves
     * clients on the local network, which discover the server and send their offers there. A
     * port another program holds costs that way in, with a warning, not the server.
     */
    private startNetherNet(
        address: string,
        port: number,
        serverName: ServerName,
        ids: ConnectionIds
    ): NetherNetTransport {
        const server = this.server;
        const config = server.getConfig();
        const logger = server.getLogger();
        // Discovery is IPv4 broadcast, so an IPv6 bind address leaves it on every interface.
        const nethernet = new NetherNetServer({ host: isIPv4(address) ? address : '0.0.0.0' });
        // Read before anything binds, so a malformed setting stops the start instead of half of it.
        const udpPorts = parseUdpPorts(config.getServerUdpPorts());
        if (udpPorts.local !== undefined) constrainIcePorts(nethernet, udpPorts.local);

        // Kept in the server directory: a client joining over plain HTTP remembers the key and
        // asks the player again if it ever changes.
        const identity = NetherNetIdentity.loadOrCreate(withCwd(NETHERNET_IDENTITY_FILE));
        this.signaling = new HttpSignaling({
            answerer: nethernet,
            status: () => joinStatusJson(netherNetStatusOf(serverName.getSnapshot(), config.getLevelName())),
            sign: (answer) => identity.sign(withMappedCandidates(answer, udpPorts.mappings)),
            logger
        });
        this.signaling.listen(port, address).then(
            (bound) => logger.info(`NetherNet clients can join by address on TCP port ${bound}`),
            (error: unknown) =>
                logger.warn(
                    `NetherNet clients cannot join by address: TCP port ${port} is unavailable (${error instanceof Error ? error.message : String(error)})`
                )
        );

        if (config.getEnableLanVisibility()) {
            this.stopLanAdvertisement = advertiseOnLan(
                nethernet,
                serverName,
                config.getLevelName(),
                config.getOnlineMode()
            );
            nethernet.listen().then(
                () => logger.info(`Visible to NetherNet clients on the local network (UDP port ${NETHERNET_LAN_PORT})`),
                (error: unknown) =>
                    logger.warn(
                        `Not visible on the local network: UDP port ${NETHERNET_LAN_PORT} is unavailable (${error instanceof Error ? error.message : String(error)})`
                    )
            );
        }

        return new NetherNetTransport(nethernet, ids, undefined, logger);
    }

    /** Keeps the advertised player count at the number of live connections, whatever carries them. */
    private countConnection(serverName: ServerName, id: ConnectionId, live: boolean): void {
        if (live) this.liveConnections.add(id);
        else this.liveConnections.delete(id);
        serverName.setOnlinePlayerCount(this.liveConnections.size);
    }
}

/**
 * Provides the {@link Networking} service as `prismarine:network`. The module
 * neither starts nor stops the listener: the bind address and port arrive with
 * `Server.bootstrap(ip, port)` after the kernel has started, and the listener
 * outlives a kernel restart (`Server.reload` never rebinds), so the server
 * drives {@link Networking.start} and {@link Networking.kill} at the exact
 * points `bootstrap` and `shutdown` always did.
 *
 * @param networking - The networking the server constructed, so its listener is
 * reachable before the kernel starts.
 * @returns The module to register on the kernel.
 */
export const networkModule = (networking: Networking): Module => ({
    id: 'prismarine:network',
    register: (ctx) => {
        ctx.provide(networkToken, networking);
    }
});
