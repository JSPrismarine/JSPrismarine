import type { Module } from '@jsprismarine/kernel';
import { RakNetListener, ServerName, WorkerServerSocket } from '@jsprismarine/raknet';
import type { RakNetListenerLike } from '@jsprismarine/raknet';

import ClientConnection from '../network/ClientConnection';
import type { InboundPacketRecord, InboundPacketRecorder } from '../network/InboundPacketTrace';
import type { OutboundPacketRecorder } from '../network/OutboundPacketTrace';
import NetworkDispatcher from '../network/NetworkDispatcher';
import RakNetTransport from '../network/transport/RakNetTransport';
import type { RakNetTransportConnection } from '../network/transport/RakNetTransport';
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
     * Binds the listener and wires inbound traffic to the packet dispatcher.
     * @param address - The address to bind.
     * @param port - The port to bind.
     */
    start(address: string, port: number): void;

    /** Replays one accepted packet through the connected session's handler path. */
    replayInboundRecord?(record: InboundPacketRecord, tickOffset?: number): Promise<void>;

    /**
     * Kills the listener, dropping every session with it. A no-op before
     * {@link Networking.start}, so an early shutdown has nothing to do here.
     */
    kill(): void;

    /**
     * The listener underneath, for what the transport seam does not cover yet:
     * the query protocol's raw datagrams and the advertised server name.
     * @returns The listener, or undefined before {@link Networking.start}.
     */
    getListener(): RakNetListenerLike | undefined;

    /** Hands worker-delivered network records to the game thread at the start of a tick. */
    pollInbound(): number;
}

/**
 * The RakNet-backed {@link Networking}: owns the `RakNetListener` and, once
 * started, the `NetworkDispatcher` routing its traffic. Extracted verbatim from
 * `Server.bootstrap`; construction does no I/O, so the instance is safe to
 * build and provide before anything binds.
 */
export class ServerNetworking implements Networking {
    private raknet: RakNetListenerLike | undefined;
    private dispatcher: NetworkDispatcher<RakNetTransportConnection> | undefined;

    public constructor(
        private readonly server: Server,
        private readonly inboundPacketRecorder?: InboundPacketRecorder,
        private readonly outboundPacketRecorder?: OutboundPacketRecorder
    ) {}

    /** Binds the RakNet listener and subscribes the packet dispatcher to it. */
    public start(address: string, port: number): void {
        const server = this.server;
        const serverName = new ServerName(server, latestCodec);
        this.raknet = server.getConfig().getUseRakNetWorker()
            ? new WorkerServerSocket(
                  server.getConfig().getMaxPlayers(),
                  server.getConfig().getOnlineMode(),
                  serverName,
                  server.getLogger()
              )
            : new RakNetListener(
                  server.getConfig().getMaxPlayers(),
                  server.getConfig().getOnlineMode(),
                  serverName,
                  server.getLogger()
              );
        this.raknet.start(address, port);

        // The dispatcher subscribes itself; holding it is unnecessary, the transport keeps
        // it alive through the listeners it installed.
        this.dispatcher = new NetworkDispatcher({
            transport: new RakNetTransport(this.raknet, server),
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

    /** Kills the listener if one was started. */
    public kill(): void {
        this.raknet?.kill();
    }

    /** The listener, or undefined before {@link ServerNetworking.start}. */
    public getListener(): RakNetListenerLike | undefined {
        return this.raknet;
    }

    /** Drains worker events in queue order; socket mode already delivers on the event loop. */
    public pollInbound(): number {
        return this.raknet instanceof WorkerServerSocket ? this.raknet.pollInbound() : 0;
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
