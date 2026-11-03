import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import type { EventEmitter } from '../events/EventEmitter';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import RaknetDisconnectEvent from '../events/raknet/RaknetDisconnectEvent';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import Timer from '../utils/Timer';
import type ClientConnection from './ClientConnection';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { readPacketId } from '@jsprismarine/protocol/NetworkPacket';
import { takesConnection } from './handler/ConnectionPacketHandler';
import type { PacketLogFilter } from './PacketLogFilter';
import type PacketHandlerRegistry from './PacketHandlerRegistry';
import type { RegisteredHandler } from './PacketHandlerRegistry';
import type { InboundPacketRecord, InboundPacketRecorder } from './InboundPacketTrace';
import type { OutboundPacketRecorder } from './OutboundPacketTrace';
import { Pipeline } from './pipeline/ConnectionPipeline';
import type { Transport, TransportConnection } from './transport/Transport';

/** A decoded packet the phase gate has paired with the handler it will run. */
interface GatedPacket {
    readonly packet: NetworkPacket<unknown>;
    readonly handler: RegisteredHandler;
}

/** What the dispatcher needs from each collaborator; the server wires its own parts in. */
export interface NetworkDispatcherOptions<C extends TransportConnection> {
    /** Where connections and frames come from. */
    transport: Transport<C>;
    /** The registry of live connections, keyed by transport token. */
    sessionManager: Pick<SessionManager, 'has' | 'add' | 'get' | 'remove'>;
    /** Resolves a packet class name to its handler; packets resolve through each connection's codec. */
    packetHandlerRegistry: Pick<PacketHandlerRegistry, 'getHandler'>;
    /** Where the legacy `raknetDisconnect` event still goes. */
    events: Pick<EventEmitter, 'emit'>;
    /** Handed to every packet handler; their contract takes the whole server. */
    server: Server;
    logger: Logger;
    /** Which packets the traffic log leaves out. */
    logFilter: PacketLogFilter;
    /** Optional sink for accepted inbound packet bytes. Disabled unless the server opts in. */
    inboundPacketRecorder?: InboundPacketRecorder;
    /** Optional sink for clientbound packet bytes. Disabled unless the server opts in. */
    outboundPacketRecorder?: OutboundPacketRecorder;
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
    private readonly packetHandlerRegistry: NetworkDispatcherOptions<C>['packetHandlerRegistry'];
    private readonly events: NetworkDispatcherOptions<C>['events'];
    private readonly server: Server;
    private readonly logger: Logger;
    private readonly logFilter: PacketLogFilter;
    private readonly createConnection: NetworkDispatcherOptions<C>['createConnection'];
    private readonly query: NetworkDispatcherOptions<C>['query'];
    private readonly inboundPacketRecorder: NetworkDispatcherOptions<C>['inboundPacketRecorder'];
    private readonly outboundPacketRecorder: NetworkDispatcherOptions<C>['outboundPacketRecorder'];
    private readonly packetPayloads: WeakMap<NetworkPacket<unknown>, { payload: Buffer; tick: number }> | undefined;
    private readonly frameTicks: WeakMap<ClientConnection, number> | undefined;
    private readonly connectionSequences: WeakMap<ClientConnection, { id: number; next: number }> | undefined;
    private readonly connectionsByTraceId = new Map<number, ClientConnection>();
    private readonly traceConnectionIds = new WeakMap<ClientConnection, number>();
    private readonly traceTokens = new WeakMap<ClientConnection, string>();
    private readonly replaySequences = new Map<number, number>();
    private nextConnectionId = 1;
    /** Keeps each reliable-ordered client stream sequential through async packet handlers. */
    private readonly frameQueues = new WeakMap<ClientConnection, Promise<void>>();

    public constructor(options: NetworkDispatcherOptions<C>) {
        this.sessionManager = options.sessionManager;
        this.packetHandlerRegistry = options.packetHandlerRegistry;
        this.events = options.events;
        this.server = options.server;
        this.logger = options.logger;
        this.logFilter = options.logFilter;
        this.createConnection = options.createConnection;
        this.query = options.query;
        this.inboundPacketRecorder = options.inboundPacketRecorder;
        this.outboundPacketRecorder = options.outboundPacketRecorder;
        this.packetPayloads = options.inboundPacketRecorder === undefined ? undefined : new WeakMap();
        this.frameTicks = options.inboundPacketRecorder === undefined ? undefined : new WeakMap();
        this.connectionSequences = options.inboundPacketRecorder === undefined ? undefined : new WeakMap();

        options.transport.onConnect((connection) => this.handleConnect(connection));
        options.transport.onDisconnect((address, reason) => this.handleDisconnect(address, reason));
        options.transport.onFrame((payload, address) => this.enqueueFrame(payload, address));
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
        const clientConnection = this.createConnection(connection);
        const connectionId = this.nextConnectionId;
        this.nextConnectionId += 1;
        // Playback assigns captured ids on a fresh server even when that server is not recording.
        this.connectionsByTraceId.set(connectionId, clientConnection);
        this.traceConnectionIds.set(clientConnection, connectionId);
        this.traceTokens.set(clientConnection, token);
        if (this.outboundPacketRecorder !== undefined) {
            clientConnection.setOutboundPacketRecorder(this.outboundPacketRecorder, connectionId, () =>
                this.server.getTick()
            );
        }
        if (this.inboundPacketRecorder !== undefined) {
            // A process-local ordinal avoids writing the client's address into a trace. It is
            // stable for this capture and does not identify the same client across captures.
            this.connectionSequences?.set(clientConnection, { id: connectionId, next: 0 });
        }
        this.sessionManager.add(token, clientConnection);
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
        if (session !== null) {
            const connectionId = this.traceConnectionIds.get(session);
            if (connectionId !== undefined) {
                this.connectionsByTraceId.delete(connectionId);
                this.replaySequences.delete(connectionId);
            }
        }

        // Read before the tear-down below, which detaches the session and takes the
        // player out of its world. A player is only added to a world once the client
        // reports itself initialized, so a session whose player is not in one belongs
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

    /**
     * The inbound pipeline, assembled once and run per frame with the connection the frame
     * arrived on as the context: split the batch, decode each packet through the connection's
     * codec, log what the filter admits, gate on the connection's phase, and dispatch.
     */
    private readonly inbound: Pipeline<Buffer, never, ClientConnection> = Pipeline.start<Buffer, ClientConnection>()
        .pipe((frame, connection) => this.splitBatch(frame, connection))
        .pipe((buffer, connection) => this.decodePacket(buffer, connection))
        .pipe((packet) => this.logInbound(packet))
        .pipe((packet, connection) => this.gatePhase(packet, connection))
        .pipe((gated, connection) => this.dispatch(gated, connection));

    private enqueueFrame(payload: Buffer, inetAddr: InetAddress): Promise<void> {
        const token = inetAddr.toToken();
        // Stamp arrival before the per-connection queue. A previous async handler may hold this
        // frame until a later tick, but replay must keep the tick the client input arrived on.
        const tick = this.inboundPacketRecorder === undefined ? undefined : this.server.getTick();
        const connection = this.sessionManager.get(token);
        if (connection === null) return this.handleFrame(payload, inetAddr, undefined, tick);

        const previous = this.frameQueues.get(connection) ?? Promise.resolve();
        const current = previous.then(() => this.handleFrame(payload, inetAddr, connection, tick));
        this.frameQueues.set(connection, current);
        return current;
    }

    private async handleFrame(
        payload: Buffer,
        inetAddr: InetAddress,
        expectedConnection?: ClientConnection,
        tick?: number
    ): Promise<void> {
        try {
            const token = inetAddr.toToken();
            const connection = this.sessionManager.get(token);
            if (connection === null || (expectedConnection !== undefined && connection !== expectedConnection)) {
                this.logger.error(`Got a packet from a closed connection (${token})`);
                return;
            }

            if (tick !== undefined) this.frameTicks?.set(connection, tick);
            await this.inbound.run(payload, connection);
        } catch (error: unknown) {
            this.logger.error(error);
        }
    }

    /** Inflates one frame into the encoded packets batched inside it. */
    private async splitBatch(payload: Buffer, connection: ClientConnection): Promise<readonly Buffer[]> {
        const batchCodec = connection.hasCompression
            ? BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB })
            : BatchCodec.uncompressed();
        return batchCodec.decodeAsync(payload);
    }

    /**
     * Builds and decodes one packet, or yields nothing for an id the connection's codec does
     * not know or a payload that does not decode as the packet it claims to be.
     */
    private decodePacket(buffer: Buffer, connection: ClientConnection): readonly NetworkPacket<unknown>[] {
        const pid = readPacketId(buffer);

        // Resolved through the codec this connection negotiated, so each session decodes
        // with the id layout of its own protocol version.
        const packet = connection.codec.createPacket(pid, buffer);
        if (packet === null) {
            this.logger.warn(`Packet 0x${pid.toString(16)} isn't implemented`);
            return [];
        }

        try {
            packet.decode(connection.codec.context);
        } catch (error: unknown) {
            this.logger.error(error);
            this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${error}`);
            return [];
        }

        // Keep the packet-local wire bytes only while the decoded object is in this pipeline.
        // The recorder copies them after the phase gate and immediately before handler dispatch.
        if (this.packetPayloads !== undefined) {
            const tick = this.frameTicks?.get(connection);
            if (tick !== undefined) this.packetPayloads.set(packet, { payload: buffer, tick });
        }

        return [packet];
    }

    /** Logs the packets the traffic-log filter admits; drops nothing. */
    private logInbound(packet: NetworkPacket<unknown>): readonly NetworkPacket<unknown>[] {
        if (this.logFilter.shouldLog(packet)) this.logger.silly(`Received §b${packet.constructor.name}§r packet`);
        return [packet];
    }

    /**
     * The phase gate: pairs the packet with its handler, and yields nothing when the handler
     * does not accept the connection's current phase. A retail client routinely races the
     * next step - `ClientCacheStatus` lands while the login is still being handled - so the
     * drop is a debug line, as it was when the same packets were dropped for arriving
     * "before login completed".
     */
    private gatePhase(packet: NetworkPacket<unknown>, connection: ClientConnection): readonly GatedPacket[] {
        let handler: RegisteredHandler;
        try {
            handler = this.packetHandlerRegistry.getHandler(packet.getName());
        } catch (error: unknown) {
            this.handlerError(packet, error);
            return [];
        }

        if (!handler.phases.includes(connection.phase)) {
            this.logger.debug(`Dropped §b${packet.constructor.name}§r: not accepted in the ${connection.phase} phase`);
            return [];
        }

        return [{ packet, handler }];
    }

    /** Runs the handler, with the collaborator its phases entitle it to. */
    private async dispatch(
        { packet, handler }: GatedPacket,
        connection: ClientConnection,
        recordInbound = true
    ): Promise<readonly never[]> {
        try {
            // A handshake- or login-phase handler takes the bare connection; every other
            // handler needs the player session that login creates. A packet that reaches
            // the wrong side of that line is dropped rather than handed an object of the
            // wrong shape.
            const session = connection.getPlayerSession();
            if (takesConnection(handler)) {
                if (recordInbound && this.inboundPacketRecorder !== undefined) {
                    this.recordInboundPacket(packet, connection);
                }
                await handler.handle(packet, this.server, connection);
            } else if (session !== null) {
                if (recordInbound && this.inboundPacketRecorder !== undefined) {
                    this.recordInboundPacket(packet, connection);
                }
                await handler.handle(packet, this.server, session);
            } else this.logger.debug(`Dropped §b${packet.constructor.name}§r: received before login completed`);
        } catch (error: unknown) {
            this.handlerError(packet, error);
        }

        return [];
    }

    /** Records only packets that have a live handler target, without changing handler flow. */
    private recordInboundPacket(packet: NetworkPacket<unknown>, connection: ClientConnection): void {
        const input = this.packetPayloads?.get(packet);
        this.packetPayloads?.delete(packet);
        if (input === undefined || this.inboundPacketRecorder === undefined) return;

        const order = this.connectionSequences?.get(connection);
        if (order === undefined) return;

        const record = {
            connectionId: order.id,
            sequence: order.next,
            tick: input.tick,
            protocolVersion: connection.codec.protocolVersion,
            packetName: packet.getName(),
            payload: Buffer.from(input.payload)
        };
        order.next += 1;

        try {
            this.inboundPacketRecorder.record(record);
        } catch (error: unknown) {
            // Recording is diagnostic. A sink failure must not drop a packet or stop its handler.
            this.logger.error(`Inbound packet recorder failed for ${packet.getName()}: ${error}`);
            this.logger.error(error);
        }
    }

    /**
     * Dispatches one captured packet through a connection admitted by this dispatcher.
     *
     * The caller advances the server to the record's tick before calling. Packet-local order,
     * protocol version, and phase checks fail fast when the restored connection differs.
     *
     * @throws {Error} When the connection, sequence, tick, protocol, or packet does not match.
     */
    public async replayInboundRecord(record: InboundPacketRecord, tickOffset = 0): Promise<void> {
        const connection = this.connectionsByTraceId.get(record.connectionId);
        if (connection === undefined) throw new Error(`Replay connection ${record.connectionId} is not connected`);

        const token = this.traceTokens.get(connection);
        if (token === undefined) throw new Error(`Replay connection ${record.connectionId} has no live session token`);

        // Use the same per-connection queue as transport frames so replay cannot overtake an
        // unfinished handler from that client.
        const previous = this.frameQueues.get(connection) ?? Promise.resolve();
        const current = previous.then(async () => {
            if (this.sessionManager.get(token) !== connection) {
                throw new Error(`Replay connection ${record.connectionId} is no longer connected`);
            }

            const expectedSequence = this.replaySequences.get(record.connectionId) ?? 0;
            if (record.sequence !== expectedSequence) {
                throw new Error(
                    `Replay connection ${record.connectionId} expected packet ${expectedSequence}, got ${record.sequence}`
                );
            }

            const expectedTick = record.tick + tickOffset;
            const currentTick = this.server.getTick();
            if (currentTick !== expectedTick) {
                throw new Error(`Replay packet tick ${expectedTick} does not match server tick ${currentTick}`);
            }
            if (connection.codec.protocolVersion !== record.protocolVersion) {
                throw new Error(
                    `Replay protocol ${record.protocolVersion} does not match connection protocol ${connection.codec.protocolVersion}`
                );
            }

            this.frameTicks?.set(connection, currentTick);
            // Traces store packet bytes, not transport batches; rebuild one frame so playback exercises
            // the same compression and batch-decoding path as live traffic.
            const payload = Buffer.from(record.payload);
            const frame = connection.hasCompression
                ? BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).encode([payload])
                : BatchCodec.uncompressed().encode([payload]);
            const packetPayloads = await this.splitBatch(frame, connection);
            if (packetPayloads.length !== 1) {
                throw new Error(`Replay frame for ${record.packetName} contained ${packetPayloads.length} packets`);
            }

            const packets = this.decodePacket(packetPayloads[0]!, connection);
            const packet = packets[0];
            if (packets.length !== 1 || packet === undefined || packet.getName() !== record.packetName) {
                throw new Error(`Replay bytes did not decode as ${record.packetName}`);
            }

            const gated = this.gatePhase(packet, connection);
            if (gated.length !== 1) {
                throw new Error(`Replay packet ${record.packetName} was rejected in the ${connection.phase} phase`);
            }

            this.logInbound(packet);
            // This input is already in the source trace; playback must not append it a second time.
            await this.dispatch(gated[0]!, connection, false);
            this.replaySequences.set(record.connectionId, expectedSequence + 1);
        });
        // A rejected replay record must not prevent the caller from correcting it and retrying.
        this.frameQueues.set(
            connection,
            current.catch(() => {})
        );
        await current;
    }

    /** One failure shape for the lookup and the handler itself, as the old dispatch had it. */
    private handlerError(packet: NetworkPacket<unknown>, error: unknown): void {
        this.logger.error(`Handler error ${packet.constructor.name}-handler: (${error})`);
        this.logger.error(error);
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
