import { BlockList, isIPv4, isIPv6 } from 'node:net';

import type { Module } from '@jsprismarine/kernel';
import { NativeNetwork, SharedPort } from '@jsprismarine/native-network';
import {
    allocateDatagramRings,
    RakNetListener,
    RingDatagramSource,
    ServerName,
    WorkerServerSocket
} from '@jsprismarine/raknet';
import { DEFAULT_MAX_DECOMPRESSED_LENGTH } from '@jsprismarine/protocol';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';
import type { DatagramSource, RakNetListenerLike } from '@jsprismarine/raknet';
import {
    HttpSignaling,
    joinStatusJson,
    loadNativeDriver,
    NETHERNET_LAN_PORT,
    NetherNetIdentity,
    NetherNetServer,
    parsePublicIp,
    parseUdpPorts,
    PortAllocator,
    withAdvertisedCandidates
} from '@jsprismarine/nethernet';
import type { PortRange, UdpPorts, WebRtcDriver } from '@jsprismarine/nethernet';

import ClientConnection from '../network/ClientConnection';
import type { InboundPacketRecord, InboundPacketRecorder } from '../network/InboundPacketTrace';
import { InputQueue } from '../input/InputQueue';
import type { OutboundPacketRecorder } from '../network/OutboundPacketTrace';
import NetworkDispatcher from '../network/NetworkDispatcher';
import { QueryResponder } from '../network/query/QueryResponder';
import type { QueryStatus } from '../network/query/QueryResponder';
import { QuerySocket } from '../network/query/QuerySocket';
import { advertiseOnLan } from '../network/nethernet/advertiseOnLan';
import { NETHERNET_IDENTITY_FILE } from '../network/nethernet/NetherNetDefaults';
import { netherNetStatusOf } from '../network/nethernet/netherNetStatusOf';
import { publicIpFallback } from '../network/nethernet/publicIpFallback';
import type { ConnectionId, ConnectionIds } from '../network/transport/ConnectionId';
import MultiTransport from '../network/transport/MultiTransport';
import NetherNetTransport from '../network/transport/NetherNetTransport';
import RakNetTransport from '../network/transport/RakNetTransport';
import type { Transport, TransportConnection, TransportName } from '../network/transport/Transport';
import { TransportNames } from '../network/transport/Transport';
import { TcpTransport } from '../network/transport/TcpTransport';
import { JavaConnections } from '../network/java/JavaConnections';
import { javaPlayersOf } from '../network/java/javaPlayers';
import { about } from '../about';
import { softwareLabel } from '../version';
import type Server from '../Server';
import { withCwd } from '../utils/cwd';
import { errorMessage } from '../utils/errorMessage';
import { networkToken } from './tokens';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';
import { gameRuleValue } from '../content/world/gameRules';
import { GameRules } from '../world/GameRuleManager';

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
     * Binds every enabled transport and wires inbound traffic to the packet dispatcher, and
     * resolves once every transport listens.
     * @param address - The address to bind.
     * @param port - The port to bind.
     * @throws {Error} When the config enables no transport, so no client could connect, or when
     * an enabled transport cannot listen. The error names the transport, the port and the cause,
     * and every transport that did start is closed again.
     */
    start(address: string, port: number): Promise<void>;

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

    /** Hands worker-delivered network records to the game thread at the end of a tick. */
    pollInbound(): number;

    /**
     * The input step: applies the input-lane packets and player removals held since the last
     * one, in arrival order. A no-op before {@link Networking.start}.
     * @param budget - The most inputs to apply; the rest wait for the next step, in order.
     * @returns How many inputs were applied.
     */
    admitInputs(budget?: number): number;

    /**
     * Whether every frame received so far has been handled, or waits behind an input held for
     * the next input step. True before {@link Networking.start}.
     */
    isInboundSettled(): boolean;
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
    /** Stops the public address lookup; set while NetherNet may look one up. */
    private publicIpLookup: AbortController | undefined;
    /** The Java Edition listener and what answers on it; set while `java-enabled` is on. */
    private java: { readonly transport: TcpTransport; readonly connections: JavaConnections } | undefined;
    /** The query protocol's own sockets, one for each port query answers on that RakNet does not hold. */
    private querySockets: QuerySocket[] = [];
    /** The ports RakNet shares with NetherNet, which the native library owns; see ADR 0008. */
    private sharedPorts: SharedPort[] = [];
    /** The transports {@link ServerNetworking.start} started from the config, in start order. */
    private startedTransports: TransportName[] = [];
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

    /**
     * Binds every enabled transport, or takes the given one, subscribes the packet dispatcher to
     * them, and waits for each to listen.
     */
    public async start(address: string, port: number): Promise<void> {
        const server = this.server;
        const config = server.getConfig();
        const { software, protocolVersion, minecraftVersion } = about();
        this.serverName = new ServerName(server, { protocolVersion, minecraftVersions: [minecraftVersion] });
        // The pong's second name and NetherNet's `level` name the software, as other
        // third-party servers fill them, rather than the level players join.
        this.serverName.setName(software);
        // Players arrive over every transport, so RakNet's sessions are not the count; see countConnection.
        this.serverName.ownPlayerCount();

        const serverName = this.serverName;
        // Loaded before anything binds: with no WebRTC stack, NetherNet cannot start, and nothing
        // else should have started either.
        // A given transport is the only one, so nothing below binds.
        const driver =
            this.givenTransport === undefined && config.getEnableNetherNet()
                ? await this.loadWebRtcDriver()
                : undefined;
        // Read before anything binds, so a malformed setting stops the start instead of half of it.
        const udpPorts =
            driver === undefined
                ? undefined
                : // Unset, NetherNet's UDP is the port the server binds, shared with RakNet, as
                  // Bedrock Dedicated Server's server-udp-ports defaults to server-port. Port 0
                  // asks the system for one, which leaves NetherNet's to the system too.
                  parseUdpPorts(
                      config.getServerUdpPorts().trim() === '' && port > 0 ? String(port) : config.getServerUdpPorts(),
                      config.getServerPublicIp()
                  );
        // A RakNet port inside NetherNet's range is shared: the native library owns the socket and
        // hands RakNet its datagrams (ADR 0008). With RakNet off, the server port is opened the
        // same way when NetherNet's range covers it, so query can answer there too. Opened before
        // anything binds, so a taken port stops the start here.
        const shared =
            driver !== undefined && udpPorts?.local !== undefined
                ? await this.openSharedPorts(address, port, udpPorts.local, config.getEnableRakNet())
                : new Map<number, SharedPort>();
        // One queue for both editions' inputs, so they apply in one order in the input step.
        const inputs = new InputQueue(() => server.getChunkCompletionQueue().isActive);
        const rakNet: RakNetTransport[] = [];
        // One per transport that binds, settled once it listens or cannot.
        const listening: Promise<void>[] = [];
        this.transport =
            this.givenTransport ??
            new MultiTransport((ids) => {
                const transports: Transport[] = [];
                if (config.getEnableRakNet()) {
                    rakNet.push(this.startRakNet(address, port, serverName, ids, listening, shared.get(port)));
                    if (address === IPV4_WILDCARD) {
                        rakNet.push(
                            this.startRakNetV6(
                                config.getServerPortV6(),
                                serverName,
                                ids,
                                listening,
                                shared.get(config.getServerPortV6())
                            )
                        );
                    }
                    transports.push(...rakNet);
                }
                if (driver !== undefined && udpPorts !== undefined) {
                    transports.push(this.startNetherNet(driver, udpPorts, address, port, serverName, ids, listening));
                }
                if (transports.length === 0) {
                    throw new PrismarineServerErrors.NoTransportEnabled();
                }
                // Not among the transports returned: Java frames are not Bedrock batches, so the
                // Bedrock dispatcher never sees them. It shares the connection IDs all the same.
                if (config.getJavaEnabled()) {
                    this.java = this.startJava(address, config.getJavaPort(), serverName, ids, listening, inputs);
                }
                this.startedTransports = [
                    ...(rakNet.length > 0 ? [TransportNames.raknet] : []),
                    ...(driver !== undefined ? [TransportNames.nethernet] : []),
                    ...(this.java !== undefined ? [TransportNames.java] : [])
                ];
                return transports;
            });

        // The dispatcher subscribes itself; holding it is unnecessary, the transport keeps
        // it alive through the listeners it installed.
        this.dispatcher = new NetworkDispatcher({
            transport: this.transport,
            sessionManager: server.getSessionManager(),
            packetHandlerRegistry: server.getPacketHandlerRegistry(),
            events: server.getKernel().events,
            server,
            logger: server.getLogger(),
            logFilter: server.getPacketLogFilter(),
            inboundPacketRecorder: this.inboundPacketRecorder,
            outboundPacketRecorder: this.outboundPacketRecorder,
            // The chunk completion queue is active exactly while something runs the input step:
            // the tick loop turns it on when it starts and off when it stops, and a harness that
            // steps ticks by hand turns it on itself. Inputs wait for that step under the same
            // switch, so a hand-stepped tick still applies them in its input step, and a server
            // whose loop does not run applies them on arrival instead of holding them forever.
            inputs,
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
            this.startQuery(address, port, serverName, rakNet, shared.get(port));

        // After the dispatcher, so the count changes once a connection is registered or released.
        // Counted here rather than per transport: every transport advertises the same total.
        this.transport.onConnect((connection) => this.countConnection(serverName, connection.id, true));
        this.transport.onDisconnect((id) => this.countConnection(serverName, id, false));

        // Every listener is waited for, not only the first to fail, so none is still binding
        // when the kill below closes them.
        const failures = (await Promise.allSettled(listening)).flatMap((result) =>
            result.status === 'rejected' ? [result.reason] : []
        );
        if (failures.length > 0) {
            this.kill();
            throw new PrismarineServerErrors.ListenersFailedToStart(
                { reasons: failures.map((failure) => errorMessage(failure)).join('; ') },
                { cause: failures[0] }
            );
        }
    }

    /**
     * Replays an accepted packet after the caller restores its session and advances the tick.
     *
     * @throws {Error} Before the listener starts, or when the dispatcher rejects the record.
     */
    public async replayInboundRecord(record: InboundPacketRecord, tickOffset = 0): Promise<void> {
        const dispatcher = this.dispatcher;
        if (dispatcher === undefined) throw new PrismarineServerErrors.ReplayBeforeNetworking();
        await dispatcher.replayInboundRecord(record, tickOffset);
    }

    /** Closes every transport that was started. */
    public kill(): void {
        for (const port of this.sharedPorts) port.close();
        this.sharedPorts = [];
        this.stopLanAdvertisement?.();
        this.stopLanAdvertisement = undefined;
        this.publicIpLookup?.abort();
        this.publicIpLookup = undefined;
        this.signaling?.close();
        this.signaling = undefined;
        for (const querySocket of this.querySockets) querySocket.close();
        this.querySockets = [];
        this.java?.transport.close();
        this.java = undefined;
        this.transport?.close();
        this.startedTransports = [];
    }

    /**
     * The transports the config made the server start, such as `RakNet` and `NetherNet`. Empty
     * before {@link ServerNetworking.start}, after {@link ServerNetworking.kill}, and for a
     * server given its own transport, which binds none of them.
     * @returns The transport names, in start order.
     */
    public getStartedTransports(): readonly TransportName[] {
        return this.startedTransports;
    }

    /** The RakNet listener, or undefined before {@link ServerNetworking.start} or with RakNet off. */
    public getListener(): RakNetListenerLike | undefined {
        return this.raknet;
    }

    /** The advertised server name, or undefined before {@link ServerNetworking.start}. */
    public getServerName(): ServerName | undefined {
        return this.serverName;
    }

    /** Applies the held inputs through the dispatcher, which holds them; nothing before it starts. */
    public admitInputs(budget?: number): number {
        return this.dispatcher?.admitInputs(budget) ?? 0;
    }

    /** Whether the dispatcher has handled every frame, but for those that wait for the input step. */
    public isInboundSettled(): boolean {
        return this.dispatcher?.isInboundSettled() ?? true;
    }

    /** Drains worker events in queue order; socket mode already delivers on the event loop. */
    public pollInbound(): number {
        let delivered = 0;
        for (const raknet of [this.raknet, this.raknetV6]) {
            if (raknet instanceof WorkerServerSocket) delivered += raknet.pollInbound();
        }
        return delivered;
    }

    /**
     * Binds the Java Edition listener, which answers a server list ping with the same name and
     * counts the RakNet pong shows, and logs a player in under `online-mode`.
     */
    private startJava(
        address: string,
        port: number,
        serverName: ServerName,
        ids: ConnectionIds,
        listening: Promise<void>[],
        inputs: InputQueue
    ): { transport: TcpTransport; connections: JavaConnections } {
        const logger = this.server.getLogger();
        const transport = new TcpTransport(ids, logger);
        const server = this.server;
        const config = server.getConfig();
        const connections = new JavaConnections(transport, {
            status: serverName,
            brand: serverName.getName(),
            onlineMode: () => config.getOnlineMode(),
            compressionThreshold: () => config.getPacketCompressionThreshold(),
            keepAliveIntervalMs: () => config.getKeepAliveIntervalMs(),
            // TODO: a setting once the server checks chat signatures; until then chat is unsigned.
            enforcesSecureChat: () => false,
            log: logger,
            world: {
                players: javaPlayersOf(server, inputs),
                // The session paces the chunks through the server's scheduler, as it does a
                // Bedrock player's, so a Java player sees as far as a Bedrock one.
                viewDistance: () => config.getViewDistance(),
                maxPlayers: () => config.getMaxPlayers(),
                joinSettings: (session) => {
                    const world = session.getWorld();
                    const level = world.getLevel();
                    const rule = (name: string): boolean => gameRuleValue(world.getGameRuleManager(), name) === true;
                    return {
                        hardcore: level.isHardcore(),
                        dimensions: [...level.getStems().keys()],
                        reducedDebugInfo: rule('reducedDebugInfo'),
                        showDeathScreen: !rule(GameRules.DoImmediateRespawn),
                        doLimitedCrafting: rule(GameRules.DoLimitedCrafting)
                    };
                }
            }
        });
        listening.push(
            transport.listen(address, port).catch((cause: Error) => {
                throw new PrismarineServerErrors.JavaPortNotBound({ port, reason: cause.message }, { cause });
            })
        );
        return { transport, connections };
    }

    /** Binds the RakNet listener, on a worker thread when the config says so. */
    private startRakNet(
        address: string,
        port: number,
        serverName: ServerName,
        ids: ConnectionIds,
        listening: Promise<void>[],
        shared?: SharedPort
    ): RakNetTransport {
        const raknet = this.createRakNetListener(serverName, shared === undefined ? undefined : { shared, family: 4 });
        listening.push(
            rakNetListening(
                raknet,
                (cause) => new PrismarineServerErrors.RaknetPortNotBound({ port, reason: cause.message }, { cause })
            )
        );
        raknet.start(address, port);
        this.raknet = raknet;
        return new RakNetTransport(raknet, this.server.getKernel().events, ids);
    }

    /**
     * Binds the second RakNet listener a wildcard-bound server runs, on every IPv6 interface and
     * `server-portv6`, as Bedrock Dedicated Server did before 1.26.70. A port another program holds stops the
     * start, as it does for the IPv4 listener.
     */
    private startRakNetV6(
        port: number,
        serverName: ServerName,
        ids: ConnectionIds,
        listening: Promise<void>[],
        shared?: SharedPort
    ): RakNetTransport {
        const raknet = this.createRakNetListener(serverName, shared === undefined ? undefined : { shared, family: 6 });
        listening.push(
            rakNetListening(
                raknet,
                (cause) => new PrismarineServerErrors.RaknetIpv6PortNotBound({ port, reason: cause.message }, { cause })
            )
        );
        raknet.start(IPV6_WILDCARD, port);
        this.raknetV6 = raknet;
        return new RakNetTransport(raknet, this.server.getKernel().events, ids);
    }

    /**
     * Starts answering the query protocol, in two places. The game port answers for Bedrock, as
     * PocketMine-MP and other Bedrock servers do: on the RakNet listeners beside the game, since
     * query datagrams never look like RakNet's, or with RakNet off through the port NetherNet
     * shares, when NetherNet's UDP is on `port`, or else on a socket of its own. A `query-port`
     * other than `port` gets a socket of its own as well, and answers for Java Edition there
     * while `java-enabled` is on, as a Java server's `query.port` does.
     * `enable-query` is read again per datagram, so a reload that turns it off silences both.
     */
    private startQuery(
        address: string,
        port: number,
        serverName: ServerName,
        rakNet: RakNetTransport[],
        sharedPort: SharedPort | undefined
    ): void {
        const server = this.server;
        const config = server.getConfig();
        // A wildcard bind such as 0.0.0.0 tells a status tool nothing, so `server-public-ip` wins
        // when it is set. A value NetherNet would refuse falls back to the bind address here,
        // since a status reply has no start to stop.
        const hostIp = (): string => {
            try {
                return parsePublicIp(server.getConfig().getServerPublicIp()) ?? address;
            } catch {
                return address;
            }
        };
        const status = (edition: 'bedrock' | 'java'): QueryStatus => ({
            motd: serverName.getMotd(),
            ...(edition === 'java'
                ? { gameId: 'MINECRAFT', version: NEWEST_JAVA_RELEASE.minecraftVersion, hostPort: config.getJavaPort() }
                : { gameId: 'MINECRAFTPE', version: serverName.getVersion(), hostPort: serverName.getPort() }),
            software: softwareLabel(),
            plugins: server
                .getAddons()
                .loadedAddons()
                .map(({ name, version }) => `${name} ${version}`),
            map: config.getLevelName(),
            onlinePlayers: serverName.getOnlinePlayerCount(),
            maxPlayers: serverName.getMaxPlayerCount(),
            hostIp: hostIp(),
            allowList: server.getAllowList().isEnabled(),
            players: server
                .getSessionManager()
                .getSessions()
                .map((session) => session.identity.name)
        });
        const answerer = (edition: 'bedrock' | 'java') => {
            const responder = new QueryResponder(() => status(edition));
            return (datagram: Buffer, from: string, fromPort: number): Buffer | undefined =>
                server.getConfig().getEnableQuery() ? responder.respond(datagram, from, fromPort) : undefined;
        };
        const listen = (answer: ReturnType<typeof answerer>, queryPort: number, source?: DatagramSource): void => {
            const querySocket = new QuerySocket({ respond: answer }, server.getLogger(), source);
            this.querySockets.push(querySocket);
            void querySocket.start(address, queryPort).then((bound) => {
                if (bound !== undefined) server.getLogger().info(`Answering query on UDP port ${bound}`);
            });
        };

        const bedrock = answerer('bedrock');
        if (rakNet.length > 0) {
            for (const transport of rakNet) {
                transport.onRaw((datagram, from) => {
                    const reply = bedrock(datagram, from.getAddress(), from.getPort());
                    if (reply !== undefined) transport.sendRaw(reply, from);
                });
            }
        } else if (sharedPort !== undefined) {
            // The shared port's unclaimed datagrams go to the RakNet rings, which query reads instead.
            const family = isIPv6(address) ? 6 : 4;
            const rings = allocateDatagramRings();
            listen(
                bedrock,
                port,
                new RingDatagramSource(rings, family, sharedPort.port, (wakePort) =>
                    sharedPort.attach(family, rings, wakePort)
                )
            );
        } else {
            listen(bedrock, port);
        }

        if (config.getQueryPort() !== config.getServerPort()) {
            listen(answerer(config.getJavaEnabled() ? 'java' : 'bedrock'), config.getQueryPort());
        }
    }

    /**
     * An unstarted RakNet listener on the shared server name, on a worker thread when the config
     * says so, and reading a port it shares with NetherNet through rings when given one.
     */
    private createRakNetListener(
        serverName: ServerName,
        sharing?: { readonly shared: SharedPort; readonly family: 4 | 6 }
    ): RakNetListenerLike {
        const config = this.server.getConfig();
        const logger = this.server.getLogger();
        const ringed =
            sharing === undefined
                ? undefined
                : (() => {
                      const rings = allocateDatagramRings();
                      const attach = (wakePort: number) => sharing.shared.attach(sharing.family, rings, wakePort);
                      return { rings, family: sharing.family, port: sharing.shared.port, attach };
                  })();
        if (config.getUseRakNetWorker()) {
            return new WorkerServerSocket(
                config.getMaxPlayers(),
                config.getOnlineMode(),
                serverName,
                logger,
                {},
                undefined,
                ringed
            );
        }
        const source =
            ringed === undefined
                ? undefined
                : new RingDatagramSource(ringed.rings, ringed.family, ringed.port, ringed.attach);
        return new RakNetListener(
            config.getMaxPlayers(),
            config.getOnlineMode(),
            serverName,
            logger,
            {},
            'copy',
            undefined,
            source
        );
    }

    /**
     * Opens the native library's shared port for each RakNet port NetherNet's local range covers:
     * `port`, and `server-portv6` when the server listens on IPv6 too. One port serves both when
     * the two are equal, since the mux socket is dual-stack.
     * @throws {Error} When a port cannot be bound, naming it.
     */
    private async openSharedPorts(
        address: string,
        port: number,
        local: PortRange,
        withRakNet: boolean
    ): Promise<Map<number, SharedPort>> {
        const network = await NativeNetwork.load();
        const wildcard = address === IPV4_WILDCARD;
        const portV6 = wildcard && withRakNet ? this.server.getConfig().getServerPortV6() : port;
        const wanted = new Set(
            [port, ...(wildcard ? [portV6] : [])].filter(
                (candidate) => candidate >= local.start && candidate <= local.end
            )
        );
        const opened = new Map<number, SharedPort>();
        for (const candidate of wanted) {
            try {
                opened.set(candidate, SharedPort.open(network, candidate, wildcard ? '' : address));
            } catch (error: unknown) {
                for (const shared of opened.values()) shared.close();
                const params = { port: candidate, reason: errorMessage(error) };
                throw withRakNet
                    ? new PrismarineServerErrors.SharedUdpPortNotBound(params, { cause: error })
                    : new PrismarineServerErrors.NethernetPortNotBound(params, { cause: error });
            }
            if (withRakNet) this.server.getLogger().verbose(`RakNet and NetherNet share UDP port ${candidate}`);
        }
        this.sharedPorts = [...opened.values()];
        return opened;
    }

    /**
     * Starts the NetherNet server and the two ways offers reach it. HTTP signaling on the game
     * port's TCP side serves clients joining by address, and a TCP port another program holds
     * stops the start. With LAN visibility on, UDP 7551 serves clients on the local network,
     * which discover the server and send their offers there; that port being taken costs the
     * LAN its view of the server, with a warning, not the start.
     */
    private startNetherNet(
        driver: WebRtcDriver,
        udpPorts: UdpPorts,
        address: string,
        port: number,
        serverName: ServerName,
        ids: ConnectionIds,
        listening: Promise<void>[]
    ): NetherNetTransport {
        const server = this.server;
        const config = server.getConfig();
        const logger = server.getLogger();
        for (const warning of udpPorts.warnings) logger.warn(warning);
        const ports = udpPorts.local === undefined ? undefined : new PortAllocator(udpPorts.local);
        const wildcard = address === IPV4_WILDCARD || address === IPV6_WILDCARD;
        const nethernet = new NetherNetServer({
            driver,
            // Discovery is IPv4 broadcast, so an IPv6 bind address leaves it on every interface.
            host: isIPv4(address) ? address : '0.0.0.0',
            peerConfig: () => (wildcard ? {} : { bindAddress: address }),
            // A batch never inflates past this, so no message that carries one is longer.
            connection: { maxMessageBytes: DEFAULT_MAX_DECOMPRESSED_LENGTH },
            ...(ports === undefined ? {} : { ports })
        });
        if (ports !== undefined) {
            logger.verbose(
                `NetherNet players use UDP ${ports.range.start === ports.range.end ? `port ${ports.range.start}` : `ports ${ports.range.start}-${ports.range.end}`}`
            );
        }

        const lookedUp = this.lookUpPublicIp(udpPorts, address);

        // Kept in the server directory: a client joining over plain HTTP remembers the key and
        // asks the player again if it ever changes.
        const identity = NetherNetIdentity.loadOrCreate(withCwd(NETHERNET_IDENTITY_FILE));
        this.signaling = new HttpSignaling({
            answerer: nethernet,
            status: () => joinStatusJson(netherNetStatusOf(serverName.getSnapshot())),
            // After the configured addresses, the one this client dialed: behind NAT or in a
            // container it reaches the server where the interface addresses do not. The looked-up
            // address goes beside them only for a client the last answer did not reach.
            sign: async (answer, dialed, unreachedBefore) =>
                identity.sign(
                    withAdvertisedCandidates(
                        answer,
                        udpPorts,
                        dialed,
                        unreachedBefore === true ? await lookedUp?.() : undefined
                    )
                ),
            // Started at the first failure, so it has usually answered by the player's next try.
            onUnreached: () => void lookedUp?.(),
            logger
        });
        listening.push(
            this.signaling.listen(port, address).then(
                (bound) => logger.verbose(`NetherNet clients can join by address on TCP port ${bound}`),
                (error: unknown) => {
                    throw new PrismarineServerErrors.SignalingPortNotBound(
                        { port, errorMessage: errorMessage(error) },
                        {
                            cause: error
                        }
                    );
                }
            )
        );

        if (config.getEnableLanVisibility()) {
            this.stopLanAdvertisement = advertiseOnLan(nethernet, serverName, config.getOnlineMode());
            nethernet.listen().then(
                () =>
                    logger.verbose(
                        `Visible to NetherNet clients on the local network (UDP port ${NETHERNET_LAN_PORT})`
                    ),
                (error: unknown) =>
                    logger.warn(
                        `Not visible on the local network: UDP port ${NETHERNET_LAN_PORT} is unavailable (${errorMessage(error)})`
                    )
            );
        }

        return new NetherNetTransport(nethernet, ids, undefined, logger);
    }

    /**
     * The looked-up public address a client gets when it reached no address in its last answer.
     * @returns Undefined when `enable-server-public-ip-lookup` is off or the server binds
     *   loopback, which no player outside reaches.
     */
    private lookUpPublicIp(udpPorts: UdpPorts, address: string): (() => Promise<string | undefined>) | undefined {
        if (isLoopback(address) || !this.server.getConfig().getEnableServerPublicIpLookup()) return undefined;
        const stop = new AbortController();
        this.publicIpLookup = stop;
        return publicIpFallback(udpPorts.publicIp, this.server.getLogger(), { signal: stop.signal });
    }

    /**
     * Loads the WebRTC stack NetherNet runs on.
     * @throws {Error} When it cannot load, naming the platform, the cause, and `enable-nethernet`.
     */
    private async loadWebRtcDriver(): Promise<WebRtcDriver> {
        try {
            // A failed call carries the lines it logged in its error, which the transport reports;
            // the rest, such as a connection failing later, is detail for debugging.
            return await loadNativeDriver({
                log: ({ text }) => this.server.getLogger().debug(text)
            });
        } catch (error: unknown) {
            throw new PrismarineServerErrors.NethernetFailedToStart(
                { replace: errorMessage(error).replace(/\.?$/, '.') },
                { cause: error }
            );
        }
    }

    /** Keeps the advertised player count at the number of live connections, whatever carries them. */
    private countConnection(serverName: ServerName, id: ConnectionId, live: boolean): void {
        if (live) this.liveConnections.add(id);
        else this.liveConnections.delete(id);
        serverName.setOnlinePlayerCount(this.liveConnections.size);
    }
}

/** The addresses only this machine reaches, with IPv4's spelled as IPv4-mapped IPv6 too. */
const LOOPBACK = new BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');
LOOPBACK.addSubnet('::ffff:7f00:0', 104, 'ipv6');

/** Whether the server binds an address only this machine reaches, however it is spelled. */
const isLoopback = (address: string): boolean =>
    isIPv4(address) ? LOOPBACK.check(address, 'ipv4') : isIPv6(address) && LOOPBACK.check(address, 'ipv6');

/**
 * Settles once a RakNet listener binds or fails to. Subscribe before `start`: a worker's failure
 * arrives later, and a socket's `error` with no listener would be thrown instead.
 * @param raknet - The listener, not yet started.
 * @param failure - Builds the error to reject with from the listener's own, naming the transport and the port.
 * @returns A promise that resolves on `listening` and rejects on `error`.
 */
const rakNetListening = (raknet: RakNetListenerLike, failure: (cause: Error) => Error): Promise<void> =>
    new Promise((resolve, reject) => {
        let settled = false;
        raknet.on('listening', () => {
            settled = true;
            resolve();
        });
        raknet.on('error', (error) => {
            if (settled) return;
            settled = true;
            reject(failure(error));
        });
    });

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
