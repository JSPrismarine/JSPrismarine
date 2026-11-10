import { isIPv4 } from 'node:net';

import type { Module } from '@jsprismarine/kernel';
import { RakNetListener, ServerName, WorkerServerSocket } from '@jsprismarine/raknet';
import type { RakNetListenerLike } from '@jsprismarine/raknet';
import { Server as NetherNetServer } from 'nethernet';

import ClientConnection from '../network/ClientConnection';
import type { InboundPacketRecord, InboundPacketRecorder } from '../network/InboundPacketTrace';
import type { OutboundPacketRecorder } from '../network/OutboundPacketTrace';
import NetworkDispatcher from '../network/NetworkDispatcher';
import { advertiseOnLan } from '../network/nethernet/advertiseOnLan';
import { HttpSignaling } from '../network/nethernet/HttpSignaling';
import { NetherNetIdentity } from '../network/nethernet/NetherNetIdentity';
import { joinStatusJson, netherNetStatusOf } from '../network/nethernet/NetherNetStatus';
import type { ConnectionId, ConnectionIds } from '../network/transport/ConnectionId';
import MultiTransport from '../network/transport/MultiTransport';
import NetherNetTransport from '../network/transport/NetherNetTransport';
import RakNetTransport from '../network/transport/RakNetTransport';
import type { Transport, TransportConnection } from '../network/transport/Transport';
import { latestCodec } from '../network/codec/CodecRegistry';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';
import { networkToken } from './tokens';

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
    private serverName: ServerName | undefined;
    private transport: Transport | undefined;
    private dispatcher: NetworkDispatcher<TransportConnection> | undefined;
    /** Stops keeping the LAN advertisement current; set while the server advertises on the LAN. */
    private stopLanAdvertisement: (() => void) | undefined;
    /** NetherNet's HTTP signaling on the game port's TCP side; set while NetherNet is on. */
    private signaling: HttpSignaling | undefined;
    /** Every connection the transports have announced and not yet withdrawn. */
    private readonly liveConnections = new Set<ConnectionId>();

    public constructor(
        private readonly server: Server,
        private readonly inboundPacketRecorder?: InboundPacketRecorder,
        private readonly outboundPacketRecorder?: OutboundPacketRecorder
    ) {}

    /** Binds every enabled transport and subscribes the packet dispatcher to them. */
    public start(address: string, port: number): void {
        const server = this.server;
        const config = server.getConfig();
        this.serverName = new ServerName(server, latestCodec);

        const serverName = this.serverName;
        this.transport = new MultiTransport((ids) => {
            const transports: Transport[] = [];
            if (config.getEnableRakNet()) transports.push(this.startRakNet(address, port, serverName, ids));
            if (config.getEnableNetherNet()) transports.push(this.startNetherNet(address, port, serverName, ids));
            if (transports.length === 0) {
                throw new Error('No transport is enabled: turn on enable-raknet or enable-nethernet in config.json');
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
                ),
            query: {
                enabled: () => server.getConfig().getEnableQuery(),
                onRaw: (payload, address) => server.getQueryManager().onRaw(payload, address)
            }
        });

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
        return this.raknet instanceof WorkerServerSocket ? this.raknet.pollInbound() : 0;
    }

    /** Binds the RakNet listener, on a worker thread when the config says so. */
    private startRakNet(address: string, port: number, serverName: ServerName, ids: ConnectionIds): RakNetTransport {
        const server = this.server;
        const config = server.getConfig();
        const raknet = config.getUseRakNetWorker()
            ? new WorkerServerSocket(config.getMaxPlayers(), config.getOnlineMode(), serverName, server.getLogger())
            : new RakNetListener(config.getMaxPlayers(), config.getOnlineMode(), serverName, server.getLogger());
        raknet.start(address, port);
        this.raknet = raknet;
        return new RakNetTransport(raknet, server, ids);
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

        // Kept in the server directory: a client joining over plain HTTP remembers the key and
        // asks the player again if it ever changes.
        const identity = NetherNetIdentity.loadOrCreate(withCwd('nethernet-identity.pem'));
        this.signaling = new HttpSignaling({
            answerer: nethernet,
            status: () => joinStatusJson(netherNetStatusOf(serverName.getSnapshot(), config.getLevelName())),
            sign: (answer) => identity.sign(answer),
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
                () => logger.info('Visible to NetherNet clients on the local network (UDP port 7551)'),
                (error: unknown) =>
                    logger.warn(
                        `Not visible on the local network: UDP port 7551 is unavailable (${error instanceof Error ? error.message : String(error)})`
                    )
            );
        }

        return new NetherNetTransport(nethernet, ids);
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
