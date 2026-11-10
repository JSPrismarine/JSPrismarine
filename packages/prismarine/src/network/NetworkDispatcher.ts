import type { TickWaitTracker } from '../world/TickContext';
import { trackTickWaits } from '../world/TickContext';
import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
import type { EventEmitter } from '../events/EventEmitter';
import { DisconnectReason, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
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
import { InputQueue } from './InputQueue';
import type { OutboundPacketRecorder } from './OutboundPacketTrace';
import { Pipeline } from './pipeline/ConnectionPipeline';
import type { ConnectionId } from './transport/ConnectionId';
import type { Transport, TransportConnection } from './transport/Transport';

/** A packet the phase gate has paired with the handler it will run, decoded once past the gate. */
interface GatedPacket {
    readonly packet: NetworkPacket<unknown>;
    readonly handler: RegisteredHandler;
}

/** What the dispatcher needs from each collaborator; the server wires its own parts in. */
export interface NetworkDispatcherOptions<C extends TransportConnection> {
    /** Where connections and frames come from. */
    transport: Transport<C>;
    /** The registry of live connections, keyed by connection ID. */
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
    /**
     * Where input-lane packets and player removals wait for the input step. Defaults to a queue
     * of the dispatcher's own, which {@link NetworkDispatcher.admitInputs} drains.
     */
    inputs?: InputQueue;
    /** Builds the connection object the session registry holds for a transport connection. */
    createConnection: (connection: C) => ClientConnection;
}

/**
 * Routes what a {@link Transport} surfaces: admits connections into the session registry,
 * tears them down when the transport forgets them, and decodes each inbound frame as a batch
 * of packets dispatched to their registered handlers.
 *
 * Extracted verbatim from the closures `Server.bootstrap` used to install on the RakNet
 * listener; the behavior - duplicate-ID rejection, the legacy `raknetDisconnect` event's
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
    private readonly inboundPacketRecorder: NetworkDispatcherOptions<C>['inboundPacketRecorder'];
    private readonly outboundPacketRecorder: NetworkDispatcherOptions<C>['outboundPacketRecorder'];
    private readonly packetPayloads: WeakMap<NetworkPacket<unknown>, Buffer> | undefined;
    private readonly inputs: InputQueue;
    /** How many packets each connection has recorded, which is the next record's sequence. */
    private readonly connectionSequences: WeakMap<ClientConnection, { next: number }> | undefined;
    private readonly replaySequences = new Map<ConnectionId, number>();
    private nextInboundOrder = 0;
    private nextReplayOrder = 0;
    /** These codecs hold only immutable settings, so every connection can reuse them. */
    private readonly compressedBatchCodec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB });
    private readonly uncompressedBatchCodec = BatchCodec.uncompressed();
    /** Keeps each reliable-ordered client stream sequential through async packet handlers. */
    private readonly frameQueues = new WeakMap<ClientConnection, Promise<void>>();
    /**
     * For each connection with frames or replayed records not yet handled: how many, and whether
     * the one it is on waits for the input step. Read by {@link NetworkDispatcher.isInboundSettled}.
     */
    private readonly inboundWork = new Map<ClientConnection, { queued: number; parks: number }>();

    public constructor(options: NetworkDispatcherOptions<C>) {
        this.sessionManager = options.sessionManager;
        this.packetHandlerRegistry = options.packetHandlerRegistry;
        this.events = options.events;
        this.server = options.server;
        this.logger = options.logger;
        this.logFilter = options.logFilter;
        this.createConnection = options.createConnection;
        this.inboundPacketRecorder = options.inboundPacketRecorder;
        this.outboundPacketRecorder = options.outboundPacketRecorder;
        this.packetPayloads = options.inboundPacketRecorder === undefined ? undefined : new WeakMap();
        this.inputs = options.inputs ?? new InputQueue();
        this.connectionSequences = options.inboundPacketRecorder === undefined ? undefined : new WeakMap();

        options.transport.onConnect((connection) => this.handleConnect(connection));
        options.transport.onDisconnect((id, address, reason) => this.handleDisconnect(id, address, reason));
        options.transport.onFrame((payload, id) => this.enqueueFrame(payload, id));
    }

    private handleConnect(connection: C): void {
        const id = connection.id;
        // Transports draw IDs from one allocator that never repeats one, so this only trips on a
        // transport that broke that contract; refusing beats letting two clients share a session.
        if (this.sessionManager.has(id)) {
            this.logger.error(`Connection ${id} from ${connection.address} reuses a live connection's ID`);
            connection.close('Connection ID collision');
            return;
        }

        const timer = new Timer();
        this.logger.debug(`${connection.address} is attempting to connect as connection ${id}`);
        const clientConnection = this.createConnection(connection);
        // Traces name a connection by its ID rather than the client's address. A fresh server
        // numbers its connections in the same order, which is what lets playback find them.
        if (this.outboundPacketRecorder !== undefined) {
            clientConnection.setOutboundPacketRecorder(this.outboundPacketRecorder, id, () => this.server.getTick());
        }
        if (this.inboundPacketRecorder !== undefined) this.connectionSequences?.set(clientConnection, { next: 0 });
        this.sessionManager.add(id, clientConnection);
        this.logger.verbose(`New connection handling took §e${timer.stop()} ms§r`);
    }

    private async handleDisconnect(id: ConnectionId, inetAddr: InetAddress, reason: string): Promise<void> {
        const time = Date.now();

        // Claimed before anything is awaited, so nothing that runs during the awaits below can
        // reach a connection that is being torn down.
        const session = this.sessionManager.get(id);
        this.sessionManager.remove(id);
        this.replaySequences.delete(id);

        // Fired for every transport's clients, despite the name: it is the one disconnect event a
        // plugin sees before the player is torn down, whatever carried the connection.
        const event = new RaknetDisconnectEvent(inetAddr, reason);
        await this.events.emit('raknetDisconnect', event);

        if (!session) {
            this.logger.info(`${inetAddr} disconnected due to ${reason}`);
            return;
        }

        // A player's removal is an input, whatever caused it, so it waits for the input step
        // like a packet from the same client would, and after every input that client sent
        // before it. Awaited, so a reconnect from the same address, which the transport orders
        // behind this close, never finds the old player still in its world.
        await this.inputs.hold(async () => {
            // Read here, before the tear-down, which detaches the session and takes the player
            // out of its world. A player is only added to a world once the client reports itself
            // initialized, so a session whose player is not in one belongs to a client that gave
            // up between login and spawn.
            const player = session.getPlayerSession()?.getPlayer() ?? null;
            const spawned = player !== null && player.getWorld().getEntity(player.getRuntimeId()) === player;

            try {
                await session.closePlayerSession();
            } catch (error: unknown) {
                this.logger.error(error);
            }

            // A spawned player announces its own departure in chat. For one that never got
            // that far this line is the only trace the connection leaves, so it is kept at a
            // level the default console shows.
            if (spawned) this.logger.debug(`${inetAddr} disconnected due to ${reason}`);
            else {
                const who = player === null ? `${inetAddr}` : `${player.getName()} (${inetAddr})`;
                this.logger.info(`${who} disconnected during the join due to ${reason}`);
            }
            this.logger.debug(`Player destruction took about ${Date.now() - time} ms`);
        });
    }

    /**
     * The inbound pipeline, assembled once and run per frame with the connection the frame
     * arrived on as the context: split the batch, build each packet through the connection's
     * codec, gate on its handler and the connection's phase, decode what the gate admits, log
     * what the filter admits, and dispatch.
     *
     * The gate runs before the decode, so a packet nothing handles in the current phase, such as
     * a clientbound one a peer sends back, is dropped without its body being parsed.
     */
    private readonly inbound: Pipeline<Buffer, never, ClientConnection> = Pipeline.start<Buffer, ClientConnection>()
        .pipe((frame, connection) => this.splitBatch(frame, connection))
        .pipe((buffer, connection) => this.buildPacket(buffer, connection))
        .pipe((packet, connection) => this.gatePhase(packet, connection))
        .pipe((gated, connection) => this.decodePacket(gated, connection))
        .pipe((gated) => this.logInbound(gated))
        .pipe((gated, connection) => this.dispatch(gated, connection));

    private enqueueFrame(payload: Buffer, id: ConnectionId): Promise<void> {
        const connection = this.sessionManager.get(id);
        if (connection === null) return this.handleFrame(payload, id);

        // One queue per connection, and an input-lane packet holds it until the input step has
        // applied that packet, so nothing a client sent later overtakes an input it sent earlier.
        const previous = this.frameQueues.get(connection) ?? Promise.resolve();
        const current = this.track(
            connection,
            previous.then(() =>
                trackTickWaits(this.waitTracker(connection), () => this.handleFrame(payload, id, connection))
            )
        );
        this.frameQueues.set(connection, current);
        return current;
    }

    private async handleFrame(payload: Buffer, id: ConnectionId, expectedConnection?: ClientConnection): Promise<void> {
        try {
            const connection = this.sessionManager.get(id);
            if (connection === null || (expectedConnection !== undefined && connection !== expectedConnection)) {
                this.logger.error(`Got a packet from a closed connection (${id})`);
                return;
            }

            await this.inbound.run(payload, connection);
        } catch (error: unknown) {
            this.logger.error(error);
        }
    }

    /**
     * Inflates one frame into the encoded packets batched inside it.
     * @param decrypt - Whether the frame arrived encrypted. A replayed record is rebuilt from the
     * recorded packet bytes and is plain, whatever the original connection negotiated.
     */
    private async splitBatch(frame: Buffer, connection: ClientConnection, decrypt = true): Promise<readonly Buffer[]> {
        let payload: Buffer;
        try {
            // First and synchronous: the keystream is continuous, so frames must be decrypted in
            // arrival order, which the per-connection frame queue guarantees up to here.
            payload = decrypt ? connection.decryptFrame(frame) : frame;
        } catch (error: unknown) {
            // An altered, dropped or replayed frame leaves the keystream unusable for every frame
            // after it, so the connection ends rather than limping on with garbage.
            this.logger.warn(
                `Closing a connection over an invalid encrypted frame: ${error instanceof Error ? error.message : String(error)}`,
                'NetworkDispatcher/splitBatch'
            );
            void connection.disconnect('Invalid encrypted packet', false, DisconnectReason.UNEXPECTED_PACKET);
            return [];
        }

        const batchCodec = connection.hasCompression ? this.compressedBatchCodec : this.uncompressedBatchCodec;
        return batchCodec.decodeAsync(payload);
    }

    /**
     * Builds one packet over its bytes without decoding it, or yields nothing for an id the
     * connection's codec does not know.
     */
    private buildPacket(buffer: Buffer, connection: ClientConnection): readonly NetworkPacket<unknown>[] {
        const pid = readPacketId(buffer);

        // Resolved through the codec this connection negotiated, so each session decodes
        // with the id layout of its own protocol version.
        const packet = connection.codec.createPacket(pid, buffer);
        if (packet === null) {
            this.logger.warn(`Packet 0x${pid.toString(16)} isn't implemented`);
            return [];
        }

        // Keep the packet-local wire bytes only while the packet is in this pipeline. The
        // recorder copies them after the phase gate and immediately before handler dispatch.
        this.packetPayloads?.set(packet, buffer);

        return [packet];
    }

    /** Decodes a packet the gate admitted, or yields nothing for a payload that does not decode. */
    private decodePacket(gated: GatedPacket, connection: ClientConnection): readonly GatedPacket[] {
        const { packet } = gated;
        try {
            packet.decode(connection.codec.context);
        } catch (error: unknown) {
            this.logger.error(error);
            this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${error}`);
            return [];
        }

        return [gated];
    }

    /** Logs the packets the traffic-log filter admits; drops nothing. */
    private logInbound(gated: GatedPacket): readonly GatedPacket[] {
        const { packet } = gated;
        if (this.logger.isEnabled('silly') && this.logFilter.shouldLog(packet)) {
            this.logger.silly(`Received §b${packet.constructor.name}§r packet`);
        }
        return [gated];
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

    /**
     * Runs the handler, with the collaborator its phases entitle it to.
     *
     * A connection-lane or read-lane handler runs now. An input-lane handler is held for the
     * next input step ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)),
     * and this resolves once that step has run it. The caller is the connection's frame queue,
     * so a later packet of any lane from the same client waits behind a held input: a client
     * that sends a move and then asks for something the move changed gets the answer the move
     * leads to.
     *
     * @param recordInbound - Whether to record the packet. A replayed record is already in the trace.
     * @param expectedTick - For a replayed record, the tick its handler must run in.
     */
    private async dispatch(
        gated: GatedPacket,
        connection: ClientConnection,
        recordInbound = true,
        expectedTick?: number
    ): Promise<readonly never[]> {
        if (gated.handler.lane === 'input') {
            const work = this.inboundWork.get(connection);
            if (work !== undefined) work.parks++;
            try {
                await this.inputs.hold(() => this.runHandler(gated, connection, recordInbound, expectedTick));
            } finally {
                if (work !== undefined) work.parks--;
            }
        } else {
            await this.runHandler(gated, connection, recordInbound, expectedTick);
        }

        return [];
    }

    /**
     * Runs one handler and, unless it is a replay, records its packet with the tick it ran in.
     *
     * @throws {Error} Only for a replayed record whose handler runs in another tick than its own.
     */
    private async runHandler(
        { packet, handler }: GatedPacket,
        connection: ClientConnection,
        recordInbound: boolean,
        expectedTick: number | undefined
    ): Promise<void> {
        if (expectedTick !== undefined) {
            const currentTick = this.server.getTick();
            if (currentTick !== expectedTick) {
                throw new Error(`Replay packet tick ${expectedTick} does not match server tick ${currentTick}`);
            }
        }

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
    }

    /**
     * The input step: applies the input-lane packets and player removals held since the last
     * one, in arrival order, each handler awaited before the next.
     *
     * @param budget - The most inputs to apply; the rest wait for the next step, in order.
     * @returns How many inputs were applied.
     */
    public admitInputs(budget?: number): Promise<number> {
        return this.inputs.admit(budget);
    }

    /** How many inputs wait for the next input step. */
    public get pendingInputs(): number {
        return this.inputs.pending;
    }

    /**
     * Whether every frame and replayed record received so far has been handled, or waits
     * behind an input held for the next input step, or behind a chunk held for it. A harness that steps the server reads it to
     * know nothing it sent is still being decoded or handled before it runs the next tick.
     */
    public isInboundSettled(): boolean {
        for (const work of this.inboundWork.values()) {
            if (work.queued > 0 && work.parks === 0) return false;
        }
        return true;
    }

    /**
     * Tells a connection's work that its handler waits only for a tick, such as a read-lane
     * handler waiting for a chunk the next input step admits ({@link isInboundSettled}).
     */
    private waitTracker(connection: ClientConnection): TickWaitTracker {
        return {
            park: () => {
                const work = this.inboundWork.get(connection);
                if (work !== undefined) work.parks++;
            },
            unpark: () => {
                const work = this.inboundWork.get(connection);
                if (work !== undefined) work.parks--;
            }
        };
    }

    /** Counts one frame or replayed record against its connection until it has been handled. */
    private track(connection: ClientConnection, work: Promise<void>): Promise<void> {
        const entry = this.inboundWork.get(connection) ?? { queued: 0, parks: 0 };
        entry.queued++;
        this.inboundWork.set(connection, entry);
        const settle = () => {
            entry.queued--;
            if (entry.queued === 0 && this.inboundWork.get(connection) === entry) this.inboundWork.delete(connection);
        };
        void work.then(settle, settle);
        return work;
    }

    /** Records only packets that have a live handler target, without changing handler flow. */
    private recordInboundPacket(packet: NetworkPacket<unknown>, connection: ClientConnection): void {
        const payload = this.packetPayloads?.get(packet);
        this.packetPayloads?.delete(packet);
        if (payload === undefined || this.inboundPacketRecorder === undefined) return;

        const order = this.connectionSequences?.get(connection);
        if (order === undefined) return;

        const record = {
            connectionId: connection.getConnectionId(),
            order: this.nextInboundOrder,
            sequence: order.next,
            // The tick the handler runs in, which for an input-lane packet is the tick whose
            // input step applied it, and not the tick it arrived in.
            tick: this.server.getTick(),
            protocolVersion: connection.codec.protocolVersion,
            packetName: packet.getName(),
            payload: Buffer.from(payload)
        };
        this.nextInboundOrder += 1;
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
     * Dispatches one captured packet through a connection admitted by this dispatcher, on the
     * path a live packet takes.
     *
     * Call it for each record in captured global order, before the server runs the record's tick:
     * a connection-lane or read-lane record runs now, and an input-lane record is held for that
     * tick's input step, as a live packet is. The connection, global order, connection-local
     * sequence and protocol are checked here, so a record that fails them can be corrected and
     * offered again. The bytes, the phase and the tick are checked when the record's turn comes.
     *
     * @param record - The captured packet.
     * @param tickOffset - Added to the record's tick, for a replay that starts at another tick.
     * @returns Settles once the record's handler has run, which for an input-lane record is in
     *   the input step of its tick, so do not wait on it before running that tick.
     * @throws {Error} When the connection, global order, sequence, tick, protocol, or packet does not match.
     */
    public async replayInboundRecord(record: InboundPacketRecord, tickOffset = 0): Promise<void> {
        const connection = this.sessionManager.get(record.connectionId);
        if (connection === null) throw new Error(`Replay connection ${record.connectionId} is not connected`);

        const expectedOrder = this.nextReplayOrder;
        if (record.order !== expectedOrder) {
            throw new Error(`Replay expected inbound order ${expectedOrder}, got ${record.order}`);
        }

        const expectedSequence = this.replaySequences.get(record.connectionId) ?? 0;
        if (record.sequence !== expectedSequence) {
            throw new Error(
                `Replay connection ${record.connectionId} expected packet ${expectedSequence}, got ${record.sequence}`
            );
        }
        if (connection.codec.protocolVersion !== record.protocolVersion) {
            throw new Error(
                `Replay protocol ${record.protocolVersion} does not match connection protocol ${connection.codec.protocolVersion}`
            );
        }
        // Taken now rather than once the handler runs: the record after this one may come from
        // another connection, and an input-lane record does not run until its tick's input step.
        this.replaySequences.set(record.connectionId, expectedSequence + 1);
        this.nextReplayOrder = expectedOrder + 1;

        // Use the same per-connection queue as transport frames so replay cannot overtake an
        // unfinished handler, or a held input, from that client.
        const previous = this.frameQueues.get(connection) ?? Promise.resolve();
        const current = this.track(
            connection,
            previous.then(() =>
                trackTickWaits(this.waitTracker(connection), async () => {
                    if (this.sessionManager.get(record.connectionId) !== connection) {
                        throw new Error(`Replay connection ${record.connectionId} is no longer connected`);
                    }

                    // Traces store packet bytes, not transport batches; rebuild one frame so playback exercises
                    // the same compression and batch-decoding path as live traffic.
                    const payload = Buffer.from(record.payload);
                    const frame = (
                        connection.hasCompression ? this.compressedBatchCodec : this.uncompressedBatchCodec
                    ).encode([payload]);
                    const packetPayloads = await this.splitBatch(frame, connection, false);
                    if (packetPayloads.length !== 1) {
                        throw new Error(
                            `Replay frame for ${record.packetName} contained ${packetPayloads.length} packets`
                        );
                    }

                    const packet = this.buildPacket(packetPayloads[0]!, connection)[0];
                    if (packet === undefined || packet.getName() !== record.packetName) {
                        throw new Error(`Replay bytes did not decode as ${record.packetName}`);
                    }

                    const gated = this.gatePhase(packet, connection)[0];
                    if (gated === undefined) {
                        throw new Error(
                            `Replay packet ${record.packetName} was rejected in the ${connection.phase} phase`
                        );
                    }

                    const decoded = this.decodePacket(gated, connection)[0];
                    if (decoded === undefined) throw new Error(`Replay bytes did not decode as ${record.packetName}`);

                    this.logInbound(decoded);
                    // This input is already in the source trace; playback must not append it a second time.
                    await this.dispatch(decoded, connection, false, record.tick + tickOffset);
                })
            )
        );
        // A rejected replay record must not hold up the records behind it on this connection.
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
}
