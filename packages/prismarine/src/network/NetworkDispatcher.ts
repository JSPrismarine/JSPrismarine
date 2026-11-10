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
import { applyInput } from '../world/inputUnit';

/** A packet paired with the handler it will run, decoded once the phase gate lets it. */
interface GatedPacket {
    readonly packet: NetworkPacket<unknown>;
    readonly handler: RegisteredHandler;
}

/** Where {@link NetworkDispatcher} sent a packet's handler. */
interface Routed {
    /** Whether the handler runs now, so the frame that carried the packet waits for it. */
    readonly now: boolean;
    /** Settles once the handler has run. */
    readonly done: Promise<void>;
}

/**
 * One ordered chain of a connection's inbound work: each piece starts once the one before it has
 * settled. A chain with queued work is in the shared `busy` set until the work is done, which is
 * how {@link NetworkDispatcher.isInboundSettled} finds it.
 */
class WorkChain {
    private tail: Promise<void> = Promise.resolve();
    private queued = 0;
    private parks = 0;
    private readonly busy: Set<WorkChain>;
    /** Told when the piece being run waits only for a tick ({@link trackTickWaits}). */
    public readonly tracker: TickWaitTracker = {
        park: () => void this.parks++,
        unpark: () => void this.parks--
    };

    public constructor(busy: Set<WorkChain>) {
        this.busy = busy;
    }

    /** Whether no work is queued or running. */
    public get idle(): boolean {
        return this.queued === 0;
    }

    /** Whether no work is queued, or the piece being run waits only for a tick. */
    public get settled(): boolean {
        return this.queued === 0 || this.parks > 0;
    }

    /**
     * Queues one piece of work behind the rest.
     *
     * @returns Settles as the work does. A failure does not stop the work queued after it.
     */
    public append(work: () => Promise<void>): Promise<void> {
        this.queued++;
        this.busy.add(this);
        const current = this.tail.then(() => trackTickWaits(this.tracker, work));
        const settle = () => {
            this.queued--;
            if (this.queued === 0) this.busy.delete(this);
        };
        this.tail = current.then(settle, settle);
        return current;
    }
}

/** An input held for the input step. */
interface HeldInputState {
    /** Whether the step that applied it is over. */
    past: boolean;
    /** Settles, and never rejects, once the step that applied it is over. */
    readonly settled: Promise<void>;
}

/** How one connection's packets keep their order across lanes. */
interface ConnectionInbound {
    /** Decrypts, decodes and routes the connection's frames in arrival order. */
    readonly frames: WorkChain;
    /** Connection-lane and read-lane handlers that wait behind a held input or behind each other. */
    readonly deferred: WorkChain;
    /** How many of the connection's inputs wait for an input step, or for theirs to end. */
    heldInputs: number;
    /** The input the connection sent last. */
    lastInput: HeldInputState | undefined;
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
    /** Keeps each reliable-ordered client stream in order through async packet handlers. */
    private readonly connectionInbound = new WeakMap<ClientConnection, ConnectionInbound>();
    /** Every chain with work queued; read by {@link NetworkDispatcher.isInboundSettled}. */
    private readonly busyChains = new Set<WorkChain>();

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
     * codec, pair each packet with its handler, and dispatch. The phase gate runs when the
     * handler's turn comes, so a packet behind a held input is gated on the phase that input
     * leaves the connection in, and the packet is decoded and logged only once the gate admits it.
     *
     * Nothing is decoded before the gate, so a packet nothing handles, such as a clientbound one
     * a peer sends back, or one its connection's phase does not accept is dropped without its
     * body being parsed.
     */
    private readonly inbound: Pipeline<Buffer, never, ClientConnection> = Pipeline.start<Buffer, ClientConnection>()
        .pipe((frame, connection) => this.splitBatch(frame, connection))
        .pipe((buffer, connection) => this.buildPacket(buffer, connection))
        .pipe((packet) => this.resolveHandler(packet))
        .pipe((gated, connection) => this.dispatch(gated, connection));

    private enqueueFrame(payload: Buffer, id: ConnectionId): Promise<void> {
        const connection = this.sessionManager.get(id);
        if (connection === null) return this.handleFrame(payload, id);

        // One queue per connection: frames are decrypted and decoded in arrival order, and each
        // packet is routed before the next (see `route`).
        return this.inboundOf(connection).frames.append(() => this.handleFrame(payload, id, connection));
    }

    /** The order state of one connection, made on its first frame. */
    private inboundOf(connection: ClientConnection): ConnectionInbound {
        let inbound = this.connectionInbound.get(connection);
        if (inbound === undefined) {
            inbound = {
                frames: new WorkChain(this.busyChains),
                deferred: new WorkChain(this.busyChains),
                heldInputs: 0,
                lastInput: undefined
            };
            this.connectionInbound.set(connection, inbound);
        }
        return inbound;
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

    /**
     * Decodes a packet the phase gate admitted.
     * @returns Whether it decoded; a payload that does not is logged.
     */
    private decodePacket(packet: NetworkPacket<unknown>, connection: ClientConnection): boolean {
        try {
            packet.decode(connection.codec.context);
            return true;
        } catch (error: unknown) {
            this.logger.error(error);
            this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${error}`);
            return false;
        }
    }

    /** Logs the packet when the traffic-log filter admits it. */
    private logInbound(packet: NetworkPacket<unknown>): void {
        if (this.logger.isEnabled('silly') && this.logFilter.shouldLog(packet)) {
            this.logger.silly(`Received §b${packet.constructor.name}§r packet`);
        }
    }

    /** Pairs the packet with its handler, or yields nothing when no handler is registered for it. */
    private resolveHandler(packet: NetworkPacket<unknown>): readonly GatedPacket[] {
        try {
            return [{ packet, handler: this.packetHandlerRegistry.getHandler(packet.getName()) }];
        } catch (error: unknown) {
            this.handlerError(packet, error);
            return [];
        }
    }

    /**
     * The pipeline's last stage: routes the packet, and lets the frame wait only for a handler
     * that runs now.
     */
    private async dispatch(gated: GatedPacket, connection: ClientConnection): Promise<readonly never[]> {
        const routed = this.route(gated, connection);
        if (routed.now) await routed.done;
        // A live handler's failure is logged where it runs, so this only keeps a stray one visible.
        else void routed.done.catch((error: unknown) => this.logger.error(error));
        return [];
    }

    /**
     * Decides when a packet's handler runs
     * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)):
     *
     * - An input-lane handler is held for the next input step, behind every input held before it.
     *   The frame queue goes on at once, so every input a connection sends before a step is
     *   applied in that step, up to the step's budget.
     * - A connection-lane or read-lane handler from a connection with no held input, and nothing
     *   of its own still waiting, runs now, and the frame queue waits for it.
     * - Any other connection-lane or read-lane handler waits until the step that applies the last
     *   input its connection held before it is over, and until the connection's earlier waiting
     *   handlers have run. The frame queue does not wait for it, so the connection's later inputs
     *   are still held in arrival order. A client that sends a move and then asks for something
     *   the move changed gets the answer the move leads to. The step may also have applied inputs
     *   the client sent after the question, so the answer can be newer than the question, never
     *   older.
     *
     * @param recordInbound - Whether to record the packet. A replayed record is already in the trace.
     * @param expectedTick - For a replayed record, the tick its handler must run in.
     */
    private route(
        gated: GatedPacket,
        connection: ClientConnection,
        recordInbound = true,
        expectedTick?: number
    ): Routed {
        const inbound = this.inboundOf(connection);
        const run = () => this.runHandler(gated, connection, recordInbound, expectedTick);

        if (gated.handler.lane === 'input') {
            const done = this.inputs.hold(run);
            inbound.heldInputs++;
            const state: HeldInputState = {
                past: false,
                settled: done.then(
                    () => this.passInput(inbound, state),
                    () => this.passInput(inbound, state)
                )
            };
            inbound.lastInput = state;
            return { now: false, done };
        }

        if (inbound.heldInputs === 0 && inbound.deferred.idle) return { now: true, done: run() };

        const input = inbound.heldInputs > 0 ? inbound.lastInput : undefined;
        const done = inbound.deferred.append(async () => {
            if (input !== undefined && !input.past) {
                // Waiting only for an input step, which a stepping harness has to run.
                inbound.deferred.tracker.park();
                try {
                    await input.settled;
                } finally {
                    inbound.deferred.tracker.unpark();
                }
            }
            await run();
        });
        return { now: false, done };
    }

    /** Marks a held input's step as over. */
    private passInput(inbound: ConnectionInbound, input: HeldInputState): void {
        input.past = true;
        inbound.heldInputs--;
    }

    /**
     * Runs one handler, if the connection's phase accepts it, and unless it is a replay, records
     * its packet with the tick it ran in.
     *
     * The phase gate runs here, when the packet's turn comes, and the packet is decoded only once
     * the gate admits it. A retail client routinely races the next step - `ClientCacheStatus`
     * lands while the login is still being handled - so a live packet outside the handler's
     * phases is dropped with a debug line.
     *
     * @throws {Error} Only for a replayed record that its connection's phase does not accept, that
     *   does not decode, or whose handler runs in another tick than its own.
     */
    private async runHandler(
        { packet, handler }: GatedPacket,
        connection: ClientConnection,
        recordInbound: boolean,
        expectedTick: number | undefined
    ): Promise<void> {
        if (!handler.phases.includes(connection.phase)) {
            if (expectedTick !== undefined) {
                throw new Error(`Replay packet ${packet.getName()} was rejected in the ${connection.phase} phase`);
            }
            this.logger.debug(`Dropped §b${packet.constructor.name}§r: not accepted in the ${connection.phase} phase`);
            return;
        }

        if (expectedTick !== undefined) {
            const currentTick = this.server.getTick();
            if (currentTick !== expectedTick) {
                throw new Error(`Replay packet tick ${expectedTick} does not match server tick ${currentTick}`);
            }
        }

        if (!this.decodePacket(packet, connection)) {
            if (expectedTick !== undefined) throw new Error(`Replay bytes did not decode as ${packet.getName()}`);
            return;
        }
        this.logInbound(packet);

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
                if (handler.lane === 'input')
                    await applyInput(session, () => handler.handle(packet, this.server, session));
                else await handler.handle(packet, this.server, session);
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
     * Whether every frame and replayed record received so far has been decoded and routed, and
     * every handler it led to has run, or waits for the next input step: as a held input, behind
     * one, or for a chunk the step admits. A harness that steps the server reads it to know
     * nothing it sent is still being decoded or handled before it runs the next tick.
     */
    public isInboundSettled(): boolean {
        for (const chain of this.busyChains) {
            if (!chain.settled) return false;
        }
        return true;
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

        // Use the same per-connection queue as transport frames, and the same routing, so replay
        // cannot overtake an unfinished handler, or a held input, from that client.
        let routed: Routed | undefined;
        await this.inboundOf(connection).frames.append(async () => {
            if (this.sessionManager.get(record.connectionId) !== connection) {
                throw new Error(`Replay connection ${record.connectionId} is no longer connected`);
            }

            // Traces store packet bytes, not transport batches; rebuild one frame so playback exercises
            // the same compression and batch-decoding path as live traffic.
            const payload = Buffer.from(record.payload);
            const frame = (connection.hasCompression ? this.compressedBatchCodec : this.uncompressedBatchCodec).encode([
                payload
            ]);
            const packetPayloads = await this.splitBatch(frame, connection, false);
            if (packetPayloads.length !== 1) {
                throw new Error(`Replay frame for ${record.packetName} contained ${packetPayloads.length} packets`);
            }

            const packet = this.buildPacket(packetPayloads[0]!, connection)[0];
            if (packet === undefined || packet.getName() !== record.packetName) {
                throw new Error(`Replay bytes did not decode as ${record.packetName}`);
            }

            const gated = this.resolveHandler(packet);
            if (gated.length !== 1) throw new Error(`Replay packet ${record.packetName} has no handler`);

            // This input is already in the source trace; playback must not append it a second time.
            routed = this.route(gated[0]!, connection, false, record.tick + tickOffset);
            if (routed.now) await routed.done;
            // Settled below; handled here so a step that runs first does not leave it unhandled.
            else void routed.done.catch(() => {});
        });
        if (routed !== undefined && !routed.now) await routed.done;
    }

    /** One failure shape for the lookup and the handler itself, as the old dispatch had it. */
    private handlerError(packet: NetworkPacket<unknown>, error: unknown): void {
        this.logger.error(`Handler error ${packet.constructor.name}-handler: (${error})`);
        this.logger.error(error);
    }
}
