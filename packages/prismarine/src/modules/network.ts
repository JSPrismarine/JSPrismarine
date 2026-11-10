import type { Module } from '@jsprismarine/kernel';
import { RakNetListener, ServerName, WorkerServerSocket } from '@jsprismarine/raknet';
import type { RakNetListenerLike } from '@jsprismarine/raknet';

import ClientConnection from '../network/ClientConnection';
import type { InboundPacketRecord, InboundPacketRecorder } from '../network/InboundPacketTrace';
import type { OutboundPacketRecorder } from '../network/OutboundPacketTrace';
import NetworkDispatcher from '../network/NetworkDispatcher';
import type { ConnectionIds } from '../network/transport/ConnectionId';
import MultiTransport from '../network/transport/MultiTransport';
import RakNetTransport from '../network/transport/RakNetTransport';
import type { Transport, TransportConnection } from '../network/transport/Transport';
import { latestCodec } from '../network/codec/CodecRegistry';
import type Server from '../Server';
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
