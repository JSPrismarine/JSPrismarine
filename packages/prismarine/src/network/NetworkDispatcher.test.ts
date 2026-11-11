import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { InetAddress } from '@jsprismarine/raknet';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';
import type { EventEmitter } from '../events/EventEmitter';
import type Server from '../Server';
import SessionManager from '../SessionManager';
import { stub } from '../testing/stub.test.helper';
import Codec2193 from './codec/Codec2193';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import type ClientConnection from './ClientConnection';
import NetworkDispatcher from './NetworkDispatcher';
import TextPacket from '@jsprismarine/protocol/packet/TextPacket';
import { PacketLogFilter } from './PacketLogFilter';
import type PacketHandlerRegistry from './PacketHandlerRegistry';
import type PlayerSession from './PlayerSession';
import type { World } from '../world/World';
import type { InputContext } from './handler/HandlerContext';
import type { InputLaneHandler, SessionHandler } from './handler/SessionHandler';
import { STEVE } from '../testing/sessionIdentity.test.helper';
import type { InboundPacketRecorder } from './InboundPacketTrace';
import { InboundPacketTrace } from './InboundPacketTrace';
import type { OutboundPacketRecorder } from './OutboundPacketTrace';
import type { SessionPhase } from './SessionPhase';
import type { ConnectionId } from './transport/ConnectionId';
import type { Lane } from '@jsprismarine/protocol/handler/Lane';
import ClientCacheStatusPacket from '@jsprismarine/protocol/packet/ClientCacheStatusPacket';
import { ServerTicker } from '../modules/ticker';
import type { TickerServer, TickerWorld } from '../modules/ticker';
import { ChunkCompletionQueue } from '../world/ChunkCompletionQueue';
import type { Transport, TransportCapabilities, TransportConnection } from './transport/Transport';
import { TextPacketType } from '@jsprismarine/protocol';

/** Where every fake client connects from. */
const address = new InetAddress('127.0.0.1', 19132);

/** A transport the test drives by hand: subscriptions in, emit helpers out. */
class FakeTransport implements Transport<TransportConnection> {
    private connect: ((connection: TransportConnection) => Promise<void> | void) | undefined;
    private disconnect: ((id: ConnectionId, address: InetAddress, reason: string) => Promise<void> | void) | undefined;
    private frame: ((payload: Buffer, id: ConnectionId) => Promise<void> | void) | undefined;

    public onConnect(listener: (connection: TransportConnection) => Promise<void> | void): void {
        this.connect = listener;
    }

    public onDisconnect(
        listener: (id: ConnectionId, address: InetAddress, reason: string) => Promise<void> | void
    ): void {
        this.disconnect = listener;
    }

    public onFrame(listener: (payload: Buffer, id: ConnectionId) => Promise<void> | void): void {
        this.frame = listener;
    }

    public close(): void {}

    public async emitConnect(connection: TransportConnection): Promise<void> {
        await this.connect?.(connection);
    }

    public async emitDisconnect(id: ConnectionId, reason: string): Promise<void> {
        await this.disconnect?.(id, address, reason);
    }

    public async emitFrame(payload: Buffer, id: ConnectionId): Promise<void> {
        await this.frame?.(payload, id);
    }
}

const capabilities: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: Number.POSITIVE_INFINITY
};

/** A connection that records whether (and why) it was refused. */
const fakeConnection = (id: ConnectionId) => {
    const closed: (string | undefined)[] = [];
    const connection: TransportConnection = {
        id,
        address,
        capabilities,
        sendFrame: () => {},
        close: (reason) => void closed.push(reason)
    };

    return { connection, closed };
};

/** A logger that records each level's lines. */
const fakeLogger = (sillyEnabled: boolean) => {
    const lines: { level: string; message: string }[] = [];
    const record = (level: string) => (message: unknown) => void lines.push({ level, message: String(message) });
    const logger = stub<Logger>({
        isEnabled: () => sillyEnabled,
        error: record('error'),
        warn: record('warn'),
        info: record('info'),
        debug: record('debug'),
        verbose: record('verbose'),
        silly: record('silly')
    });

    return { logger, lines };
};

const message = (text: string) => {
    return new TextPacket({
        type: TextPacketType.Raw,
        needsTranslation: false,
        message: text,
        xuid: '',
        platformChatId: '',
        filtered: text
    });
};

/** One batch holding the packets, in order, as bytes off the wire. */
const batchOf = (packets: readonly (TextPacket | ClientCacheStatusPacket)[]) =>
    BatchCodec.uncompressed().encode(
        packets.map((packet) => {
            packet.encode();
            return packet.getBuffer();
        })
    );

/** One batch holding the packet, as bytes off the wire. */
const frameOf = (packet: TextPacket | ClientCacheStatusPacket, compressed = false) => {
    packet.encode();
    const payloads = [packet.getBuffer()];
    return compressed
        ? BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).encode(payloads)
        : BatchCodec.uncompressed().encode(payloads);
};

/** Captures one valid text input for replay validation tests. */
const captureTextRecord = async () => {
    const trace = new InboundPacketTrace();
    const source = makeDispatcher({
        recorder: trace,
        handler: { phases: ['handshake'], handle: async () => {} }
    });
    await source.transport.emitConnect(fakeConnection(1).connection);
    await source.transport.emitFrame(frameOf(message('replay input')), 1);

    return trace.records()[0]!;
};

/** One negotiated compressed batch, used to exercise the dispatcher's adaptive inflate path. */
const compressedFrameOf = (packet: TextPacket) => {
    packet.encode();
    return BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB }).encode([packet.getBuffer()]);
};

/** Wires a dispatcher over typed doubles; each test picks the registry and connections. */
type DoubleContext = InputContext & { readonly connection?: ClientConnection };

const makeDispatcher = (options?: {
    codec?: ProtocolCodec;
    recorder?: InboundPacketRecorder;
    outboundRecorder?: OutboundPacketRecorder;
    compressed?: boolean;
    tick?: () => number;
    loggerEnabled?: boolean;
    logFilter?: PacketLogFilter;
    /** The lane each packet's handler declares, by packet name; `connection` when not named. */
    lanes?: Readonly<Record<string, Lane>>;
    /** The phases each packet's handler accepts, by packet name; `handler.phases` when not named. */
    phasesOf?: Readonly<Record<string, readonly SessionPhase[]>>;
    /** Called when a connection's player is torn down. */
    onClosePlayerSession?: () => void;
    /** The player session every connection has, and the phase it is in; none, in `handshake`, by default. */
    session?: { readonly session: PlayerSession; readonly phase: SessionPhase };
    handler?: {
        phases: readonly SessionPhase[];
        /**
         * Handed the session's context in the play phases, and the connection's context before
         * a session exists. An input-lane double is awaited through the step's outputs.
         */
        handle: (packet: unknown, context: DoubleContext) => Promise<void>;
    };
    /** A handler in the shared shape, registered for every packet in place of `handler`. */
    contextHandler?: SessionHandler<unknown>;
}) => {
    const transport = new FakeTransport();
    const sessionManager = new SessionManager();
    const { logger, lines } = fakeLogger(options?.loggerEnabled ?? true);
    const logFilter = options?.logFilter ?? new PacketLogFilter();
    const server = stub<Server>({ getTick: options?.tick ?? (() => 0) });
    const packetHandlerRegistry = stub<PacketHandlerRegistry>({
        getHandler: (name: string) => {
            if (options?.contextHandler) return options.contextHandler;
            if (!options?.handler) throw new Error('no handler registered');
            // Every double here runs in the handshake phase, before a session exists.
            const lane = options.lanes?.[name] ?? 'connection';
            const phases = options.phasesOf?.[name] ?? options.handler.phases;
            const { handle } = options.handler;
            if (lane === 'input') {
                return {
                    lane,
                    phases,
                    handle: (packet, context) => {
                        context.step.output(handle(packet, context));
                        return undefined;
                    }
                } satisfies InputLaneHandler<unknown>;
            }
            return lane === 'read' ? { lane, phases, handle } : { lane, phases, handle };
        }
    });
    const built: ClientConnection[] = [];
    const outboundRecorderSetup: {
        recorder: OutboundPacketRecorder;
        connectionId: number;
        getTick: () => number;
    }[] = [];

    const dispatcher = new NetworkDispatcher({
        transport,
        sessionManager,
        packetHandlerRegistry,
        events: stub<EventEmitter>({ emit: async () => {} }),
        server,
        logger,
        logFilter,
        inboundPacketRecorder: options?.recorder,
        outboundPacketRecorder: options?.outboundRecorder,
        createConnection: (transportConnection) => {
            const connection = stub<ClientConnection>({
                getConnectionId: () => transportConnection.id,
                hasCompression: options?.compressed ?? false,
                codec: options?.codec ?? Codec2193,
                phase: options?.session?.phase ?? 'handshake',
                decryptFrame: (frame) => frame,
                getPlayerSession: () => options?.session?.session ?? null,
                closePlayerSession: async () => options?.onClosePlayerSession?.(),
                setOutboundPacketRecorder: (recorder, connectionId, getTick) =>
                    void outboundRecorderSetup.push({ recorder, connectionId, getTick })
            });
            built.push(connection);
            return connection;
        }
    });

    return { transport, sessionManager, lines, server, built, dispatcher, outboundRecorderSetup, logFilter };
};

describe('network', () => {
    describe('NetworkDispatcher', () => {
        it('admits a connection into the session registry under its ID', async () => {
            const { transport, sessionManager, built } = makeDispatcher();

            await transport.emitConnect(fakeConnection(1).connection);

            expect(sessionManager.get(1)).toBe(built[0]);
        });

        it('installs the outbound recorder with the connection id and a live tick lookup', async () => {
            let tick = 7;
            const recorder: OutboundPacketRecorder = { record: () => {} };
            const { transport, outboundRecorderSetup } = makeDispatcher({
                outboundRecorder: recorder,
                tick: () => tick
            });

            await transport.emitConnect(fakeConnection(1).connection);

            expect(outboundRecorderSetup).toHaveLength(1);
            expect(outboundRecorderSetup[0]?.recorder).toBe(recorder);
            expect(outboundRecorderSetup[0]?.connectionId).toBe(1);
            expect(outboundRecorderSetup[0]?.getTick()).toBe(7);

            tick = 8;
            expect(outboundRecorderSetup[0]?.getTick()).toBe(8);
        });

        it('refuses a connection whose ID a live one already holds', async () => {
            const { transport, sessionManager, lines, built } = makeDispatcher();
            await transport.emitConnect(fakeConnection(1).connection);

            const { connection, closed } = fakeConnection(1);
            await transport.emitConnect(connection);

            expect(closed).toStrictEqual(['Connection ID collision']);
            expect(built).toHaveLength(1);
            expect(sessionManager.get(1)).toBe(built[0]);
            expect(
                lines.some(({ level, message: m }) => level === 'error' && m.includes("reuses a live connection's ID"))
            ).toBe(true);
        });

        it('warns about a packet id nothing is registered for, and keeps going', async () => {
            const { transport, lines } = makeDispatcher({ codec: stub<ProtocolCodec>({ createPacket: () => null }) });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('hello')), 1);

            expect(lines.some(({ level, message: m }) => level === 'warn' && m.includes("isn't implemented"))).toBe(
                true
            );
        });

        it('disconnects a connection whose encrypted frame fails its checksum, and dispatches nothing', async () => {
            const { transport, lines, built } = makeDispatcher();
            await transport.emitConnect(fakeConnection(1).connection);
            const disconnect = vi.fn(async () => {});
            built[0]!.decryptFrame = () => {
                throw new Error('Checksum mismatch on batch 0');
            };
            built[0]!.disconnect = disconnect;

            await transport.emitFrame(frameOf(message('tampered')), 1);

            expect(disconnect).toHaveBeenCalledWith(
                'Invalid encrypted packet',
                false,
                DisconnectReason.UNEXPECTED_PACKET
            );
            expect(lines.some(({ level, message: m }) => level === 'warn' && m.includes('Checksum mismatch'))).toBe(
                true
            );
            expect(lines.some(({ message: m }) => m.includes("isn't implemented"))).toBe(false);
        });

        it('rejects a frame from a connection the registry no longer holds', async () => {
            const { transport, lines } = makeDispatcher();

            await transport.emitFrame(frameOf(message('ghost')), 99);

            expect(lines.some(({ level, message: m }) => level === 'error' && m.includes('closed connection'))).toBe(
                true
            );
        });

        it('keeps the silly inbound line and skips the filter when silly is disabled', async () => {
            const silly = makeDispatcher({
                handler: { phases: ['handshake'], handle: async () => {} }
            });
            await silly.transport.emitConnect(fakeConnection(1).connection);
            await silly.transport.emitFrame(frameOf(message('logged')), 1);

            expect(silly.lines).toContainEqual({ level: 'silly', message: 'Received §bTextPacket§r packet' });

            const filter = new PacketLogFilter();
            const shouldLog = vi.spyOn(filter, 'shouldLog');
            const info = makeDispatcher({
                loggerEnabled: false,
                logFilter: filter,
                handler: { phases: ['handshake'], handle: async () => {} }
            });
            await info.transport.emitConnect(fakeConnection(1).connection);
            await info.transport.emitFrame(frameOf(message('not logged')), 1);

            expect(shouldLog).not.toHaveBeenCalled();
            expect(info.lines.some(({ level }) => level === 'silly')).toBe(false);
        });

        it('hands a handshake-phase handler the context of its connection, and not the server', async () => {
            const targets: unknown[] = [];
            const { transport, built } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async (_packet, context) => {
                        if ('connection' in context) targets.push(context.connection);
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('login')), 1);

            expect(targets).toStrictEqual([built[0]]);
        });

        it('records accepted packet bytes with global order, connection order, and the tick they ran in', async () => {
            const trace = new InboundPacketTrace();
            let tick = 18;
            const { transport, built } = makeDispatcher({
                recorder: trace,
                tick: () => tick,
                handler: { phases: ['handshake'], handle: async () => {} }
            });
            await transport.emitConnect(fakeConnection(1).connection);
            await transport.emitConnect(fakeConnection(2).connection);

            const first = message('first');
            const firstFrame = frameOf(first);
            const firstPayload = Buffer.from(first.getBuffer());
            await transport.emitFrame(firstFrame, 1);

            tick = 19;
            const second = message('second');
            const secondFrame = frameOf(second);
            const secondPayload = Buffer.from(second.getBuffer());
            await transport.emitFrame(secondFrame, 1);

            const otherConnection = message('other');
            const otherFrame = frameOf(otherConnection);
            const otherPayload = Buffer.from(otherConnection.getBuffer());
            await transport.emitFrame(otherFrame, 2);

            // A packet outside the connection's phase is rejected before it becomes a replay input.
            built[0]!.phase = 'play';
            await transport.emitFrame(frameOf(message('rejected')), 1);

            expect(trace.records()).toEqual([
                {
                    connectionId: 1,
                    order: 0,
                    sequence: 0,
                    tick: 18,
                    protocolVersion: 2193,
                    packetName: 'TextPacket',
                    payload: firstPayload
                },
                {
                    connectionId: 1,
                    order: 1,
                    sequence: 1,
                    tick: 19,
                    protocolVersion: 2193,
                    packetName: 'TextPacket',
                    payload: secondPayload
                },
                {
                    connectionId: 2,
                    order: 2,
                    sequence: 0,
                    tick: 19,
                    protocolVersion: 2193,
                    packetName: 'TextPacket',
                    payload: otherPayload
                }
            ]);
            expect(InboundPacketTrace.deserialize(trace.serialize()).records()).toEqual(trace.records());
        });

        it('continues packet dispatch when the inbound trace sink throws', async () => {
            const recorder: InboundPacketRecorder = {
                record: () => {
                    throw new Error('trace sink failed');
                }
            };
            const handled: string[] = [];
            const { transport, lines } = makeDispatcher({
                recorder,
                handler: {
                    phases: ['handshake'],
                    handle: async (packet) => {
                        if (packet instanceof TextPacket) handled.push(packet.getPacketData()!.message);
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('still handled')), 1);

            expect(handled).toEqual(['still handled']);
            expect(lines.map(({ message: line }) => line)).toEqual(
                expect.arrayContaining([
                    expect.stringContaining('Inbound packet recorder failed for TextPacket'),
                    'Error: trace sink failed'
                ])
            );
        });

        it('replays accepted packet bytes through the handler on the matching connection and tick', async () => {
            const trace = new InboundPacketTrace();
            const handled: string[] = [];
            const handler = {
                phases: ['handshake'] as const,
                handle: async (packet: unknown) => {
                    if (packet instanceof TextPacket) handled.push(packet.getPacketData()!.message);
                }
            };
            const first = makeDispatcher({ compressed: true, recorder: trace, tick: () => 6, handler });
            await first.transport.emitConnect(fakeConnection(1).connection);
            await first.transport.emitFrame(frameOf(message('bot input'), true), 1);

            const replay = makeDispatcher({ compressed: true, recorder: trace, tick: () => 6, handler });
            await replay.transport.emitConnect(fakeConnection(1).connection);
            await replay.dispatcher.replayInboundRecord(trace.records()[0]!);

            expect(handled).toEqual(['bot input', 'bot input']);
            expect(trace.records()).toHaveLength(1);
        });

        it('replays plain bytes into a connection that negotiated encryption', async () => {
            // The record holds the packet as the client built it, not the encrypted frame that
            // carried it, so replay must not run it back through the session's cipher.
            const trace = new InboundPacketTrace();
            const handled: string[] = [];
            const handler = {
                phases: ['handshake'] as const,
                handle: async (packet: unknown) => {
                    if (packet instanceof TextPacket) handled.push(packet.getPacketData()!.message);
                }
            };
            const first = makeDispatcher({ recorder: trace, tick: () => 3, handler });
            await first.transport.emitConnect(fakeConnection(1).connection);
            await first.transport.emitFrame(frameOf(message('recorded')), 1);

            const replay = makeDispatcher({ tick: () => 3, handler });
            await replay.transport.emitConnect(fakeConnection(1).connection);
            replay.built[0]!.decryptFrame = () => {
                throw new Error('a replayed record is not encrypted');
            };
            await replay.dispatcher.replayInboundRecord(trace.records()[0]!);

            expect(handled).toEqual(['recorded', 'recorded']);
        });

        it('requires replay to follow captured order across connections', async () => {
            const trace = new InboundPacketTrace();
            const handler = { phases: ['handshake'] as const, handle: async () => {} };
            const captured = makeDispatcher({ recorder: trace, tick: () => 4, handler });
            await captured.transport.emitConnect(fakeConnection(1).connection);
            await captured.transport.emitConnect(fakeConnection(2).connection);
            await captured.transport.emitFrame(frameOf(message('first')), 1);
            await captured.transport.emitFrame(frameOf(message('second')), 2);

            const replay = makeDispatcher({ tick: () => 4, handler });
            await replay.transport.emitConnect(fakeConnection(1).connection);
            await replay.transport.emitConnect(fakeConnection(2).connection);

            await expect(replay.dispatcher.replayInboundRecord(trace.records()[1]!)).rejects.toThrow(
                'Replay expected inbound order 0, got 1'
            );
            await replay.dispatcher.replayInboundRecord(trace.records()[0]!);
            await replay.dispatcher.replayInboundRecord(trace.records()[1]!);
        });

        it('rejects a replay record for a connection that was not admitted', async () => {
            const record = await captureTextRecord();
            const replay = makeDispatcher({ handler: { phases: ['handshake'], handle: async () => {} } });
            await replay.transport.emitConnect(fakeConnection(1).connection);

            await expect(
                replay.dispatcher.replayInboundRecord({ ...record, connectionId: record.connectionId + 1 })
            ).rejects.toThrow('Replay connection 2 is not connected');
        });

        it('rejects a replay record from a different tick', async () => {
            const record = await captureTextRecord();
            const replay = makeDispatcher({ handler: { phases: ['handshake'], handle: async () => {} } });
            await replay.transport.emitConnect(fakeConnection(1).connection);

            await expect(replay.dispatcher.replayInboundRecord(record, 1)).rejects.toThrow(
                'Replay packet tick 1 does not match server tick 0'
            );
        });

        it('rejects a replay record from a different protocol version', async () => {
            const record = await captureTextRecord();
            const replay = makeDispatcher({
                codec: stub<ProtocolCodec>({ protocolVersion: 1 }),
                handler: { phases: ['handshake'], handle: async () => {} }
            });
            await replay.transport.emitConnect(fakeConnection(1).connection);

            await expect(replay.dispatcher.replayInboundRecord(record)).rejects.toThrow(
                'Replay protocol 2193 does not match connection protocol 1'
            );
        });

        it('rejects a replay record that skips the next connection-local sequence', async () => {
            const record = await captureTextRecord();
            const replay = makeDispatcher({ handler: { phases: ['handshake'], handle: async () => {} } });
            await replay.transport.emitConnect(fakeConnection(1).connection);

            await expect(replay.dispatcher.replayInboundRecord({ ...record, sequence: 1 })).rejects.toThrow(
                'Replay connection 1 expected packet 0, got 1'
            );
        });

        it('rejects replay bytes that decode to a different packet name', async () => {
            const record = await captureTextRecord();
            const replay = makeDispatcher({ handler: { phases: ['handshake'], handle: async () => {} } });
            await replay.transport.emitConnect(fakeConnection(1).connection);

            await expect(
                replay.dispatcher.replayInboundRecord({ ...record, packetName: 'LoginPacket' })
            ).rejects.toThrow('Replay bytes did not decode as LoginPacket');
        });

        it('rejects a replay packet that is not accepted in the connection phase', async () => {
            const record = await captureTextRecord();
            const replay = makeDispatcher({ handler: { phases: ['handshake'], handle: async () => {} } });
            await replay.transport.emitConnect(fakeConnection(1).connection);
            replay.built[0]!.phase = 'play';

            await expect(replay.dispatcher.replayInboundRecord(record)).rejects.toThrow(
                'Replay packet TextPacket was rejected in the play phase'
            );
        });

        it('rejects a replay queued before its connection disconnects', async () => {
            const trace = new InboundPacketTrace();
            // Hold a live handler open so replay queues behind it, then disconnect before replay can run.
            let releaseLive!: () => void;
            let signalLive!: () => void;
            const liveStarted = new Promise<void>((resolve) => {
                signalLive = resolve;
            });
            const liveGate = new Promise<void>((resolve) => {
                releaseLive = resolve;
            });
            const { transport, dispatcher } = makeDispatcher({
                recorder: trace,
                handler: {
                    phases: ['handshake'],
                    handle: async () => {
                        signalLive();
                        await liveGate;
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const liveFrame = transport.emitFrame(frameOf(message('live input')), 1);
            await liveStarted;
            const replay = dispatcher.replayInboundRecord(trace.records()[0]!);
            // The connection leaves the registry at once; the removal of its player waits for
            // the input step.
            const disconnected = transport.emitDisconnect(1, 'client disconnected');

            releaseLive();
            await liveFrame;
            await expect(replay).rejects.toThrow('Replay connection 1 is no longer connected');
            await dispatcher.admitInputs();
            await disconnected;
        });

        it('queues replay after unfinished frames from the same connection', async () => {
            const trace = new InboundPacketTrace();
            const handled: string[] = [];
            let releaseLive!: () => void;
            let signalLive!: () => void;
            const liveStarted = new Promise<void>((resolve) => {
                signalLive = resolve;
            });
            const liveGate = new Promise<void>((resolve) => {
                releaseLive = resolve;
            });
            const { transport, dispatcher } = makeDispatcher({
                recorder: trace,
                tick: () => 3,
                handler: {
                    phases: ['handshake'],
                    handle: async (packet) => {
                        if (!(packet instanceof TextPacket)) return;
                        const text = packet.getPacketData()!.message;
                        handled.push(text);
                        if (text === 'live input') {
                            signalLive();
                            await liveGate;
                        }
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const liveFrame = transport.emitFrame(frameOf(message('live input')), 1);
            await liveStarted;
            const replay = dispatcher.replayInboundRecord(trace.records()[0]!);
            await Promise.resolve();

            expect(handled).toEqual(['live input']);

            releaseLive();
            await Promise.all([liveFrame, replay]);

            expect(handled).toEqual(['live input', 'live input']);
            expect(trace.records()).toHaveLength(1);
        });

        it('stamps a packet with the tick its handler ran in, not the tick it arrived in', async () => {
            const trace = new InboundPacketTrace();
            let tick = 7;
            let handled = 0;
            let releaseFirst!: () => void;
            let signalFirst!: () => void;
            const firstHandler = new Promise<void>((resolve) => {
                signalFirst = resolve;
            });
            const firstGate = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            const { transport } = makeDispatcher({
                recorder: trace,
                tick: () => tick,
                handler: {
                    phases: ['handshake'],
                    handle: async () => {
                        handled += 1;
                        if (handled === 1) {
                            signalFirst();
                            await firstGate;
                        }
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const first = transport.emitFrame(frameOf(message('first')), 1);
            await firstHandler;
            tick = 8;
            const second = transport.emitFrame(frameOf(message('second')), 1);
            tick = 9;
            releaseFirst();
            await Promise.all([first, second]);

            // The second arrived in tick 8 and ran once the first let go, in tick 9.
            expect(trace.records().map((record) => record.tick)).toEqual([7, 9]);
        });

        it('drops a handshake packet once the connection has left the handshake phase', async () => {
            const targets: unknown[] = [];
            const { transport, built, lines } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async (_packet, context) => void targets.push(context.session)
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);
            built[0]!.phase = 'play';
            built[0]!.getPlayerSession = () => stub<PlayerSession>();

            await transport.emitFrame(frameOf(message('late')), 1);

            expect(targets).toHaveLength(0);
            expect(
                lines.some(({ level, message: m }) => level === 'debug' && m.includes('not accepted in the play phase'))
            ).toBe(true);
        });

        it('drops a packet without decoding it when no handler accepts it in the current phase', async () => {
            const decode = vi.spyOn(TextPacket.prototype, 'decode');
            const unhandled = makeDispatcher();
            await unhandled.transport.emitConnect(fakeConnection(1).connection);
            const wrongPhase = makeDispatcher({ handler: { phases: ['play'], handle: async () => {} } });
            await wrongPhase.transport.emitConnect(fakeConnection(1).connection);

            await unhandled.transport.emitFrame(frameOf(message('nobody handles this')), 1);
            await wrongPhase.transport.emitFrame(frameOf(message('too early')), 1);

            expect(decode).not.toHaveBeenCalled();
            decode.mockRestore();
        });

        it('hands a play-phase handler the player session once login has created one', async () => {
            const session = stub<PlayerSession>();
            const trace = new InboundPacketTrace();
            const targets: unknown[] = [];
            const { transport, built } = makeDispatcher({
                recorder: trace,
                handler: { phases: ['play'], handle: async (_packet, context) => void targets.push(context.session) }
            });
            await transport.emitConnect(fakeConnection(1).connection);
            built[0]!.phase = 'play';
            built[0]!.getPlayerSession = () => session;

            await transport.emitFrame(frameOf(message('chat')), 1);

            expect(targets).toStrictEqual([session]);
            expect(trace.records().map((record) => record.packetName)).toEqual(['TextPacket']);
        });

        it('processes frames from one client in arrival order while a handler awaits', async () => {
            let markFirstStarted!: () => void;
            let releaseFirst!: () => void;
            const firstStarted = new Promise<void>((resolve) => (markFirstStarted = resolve));
            const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
            const handled: string[] = [];
            const { transport } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async (packet) => {
                        if (!(packet instanceof TextPacket)) throw new Error('expected a text packet');
                        const text = packet.getPacketData()?.message;
                        if (text === undefined) throw new Error('expected a packet message');

                        handled.push(`${text}:start`);
                        if (text === 'first') {
                            markFirstStarted();
                            await firstGate;
                        }
                        handled.push(`${text}:finish`);
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const first = transport.emitFrame(frameOf(message('first')), 1);
            await firstStarted;
            const second = transport.emitFrame(frameOf(message('second')), 1);
            await new Promise<void>((resolve) => setImmediate(resolve));

            expect(handled).toStrictEqual(['first:start']);

            releaseFirst();
            await Promise.all([first, second]);

            expect(handled).toStrictEqual(['first:start', 'first:finish', 'second:start', 'second:finish']);
        });

        it('dispatches compressed small and large frames in arrival order', async () => {
            const handled: string[] = [];
            const smallText = 'small:' + 'x'.repeat(64);
            let state = 0x6d2b79f5;
            const largeText = Array.from({ length: 32 * 1024 }, () => {
                state ^= state << 13;
                state ^= state >>> 17;
                state ^= state << 5;
                return String.fromCharCode(33 + ((state >>> 0) % 94));
            }).join('');
            const frames = [compressedFrameOf(message(smallText)), compressedFrameOf(message(largeText))];
            expect(frames[0]!.subarray(2).byteLength).toBeLessThan(8 * 1024);
            expect(frames[1]!.subarray(2).byteLength).toBeGreaterThan(16 * 1024);
            const { transport } = makeDispatcher({
                compressed: true,
                handler: {
                    phases: ['handshake'],
                    handle: async (packet) => {
                        if (!(packet instanceof TextPacket)) throw new Error('expected a text packet');
                        const text = packet.getPacketData()?.message;
                        if (text === undefined) throw new Error('expected a text message');
                        handled.push(text);
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            for (const frame of frames) await transport.emitFrame(frame, 1);

            expect(handled).toStrictEqual([smallText, largeText]);
        });

        it('drops a play packet that arrives before login has completed', async () => {
            const targets: unknown[] = [];
            const { transport, lines } = makeDispatcher({
                handler: { phases: ['play'], handle: async (_packet, context) => void targets.push(context.session) }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('early')), 1);

            expect(targets).toHaveLength(0);
            expect(
                lines.some(
                    ({ level, message: m }) => level === 'debug' && m.includes('not accepted in the handshake phase')
                )
            ).toBe(true);
        });

        it('drops a session packet whose connection has no session yet', async () => {
            const targets: unknown[] = [];
            const { transport, built, lines } = makeDispatcher({
                handler: { phases: ['play'], handle: async (_packet, context) => void targets.push(context.session) }
            });
            await transport.emitConnect(fakeConnection(1).connection);
            built[0]!.phase = 'play';

            await transport.emitFrame(frameOf(message('early')), 1);

            expect(targets).toHaveLength(0);
            expect(
                lines.some(({ level, message: m }) => level === 'debug' && m.includes('before login completed'))
            ).toBe(true);
        });

        it('logs a handler failure without letting it escape the dispatch', async () => {
            const { transport, lines } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async () => {
                        throw new Error('handler blew up');
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('boom')), 1);

            expect(lines.some(({ level, message: m }) => level === 'error' && m.includes('Handler error'))).toBe(true);
        });
    });

    describe('NetworkDispatcher input lane', () => {
        /** A dispatcher whose connections have a session, as a handler in the shared shape needs. */
        const makeSessionDispatcher = (options?: Parameters<typeof makeDispatcher>[0]) =>
            makeDispatcher({
                session: { session: stub<PlayerSession>({ identity: STEVE }), phase: 'play' },
                ...options
            });

        const cacheStatus = () => {
            const packet = new ClientCacheStatusPacket();
            packet.enabled = true;
            return packet;
        };
        const nameOf = (packet: unknown): string =>
            packet instanceof TextPacket ? `input:${packet.getPacketData()!.message}` : 'read';
        /** One event-loop turn, enough for a frame to decode and reach its handler. */
        const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

        /** A ticker that drives the dispatcher's input step and the given worlds, stepped by hand. */
        const tickerOver = (dispatcher: NetworkDispatcher<TransportConnection>, worlds: TickerWorld[]) => {
            const completions = new ChunkCompletionQueue();
            const deps: TickerServer = {
                admitInputs: () => dispatcher.admitInputs(),
                emitTick: async () => {},
                pollNetwork: () => 0,
                getWorlds: () => worlds,
                tickFunctions: async () => 0,
                getChunkScheduler: () => ({ setBudget: () => {}, tick: async () => 0 }),
                getChunkCompletionQueue: () => completions,
                getChunkSendBudgetMs: () => 0,
                isTickingEnabled: () => false,
                isProcessTitleEnabled: () => false,
                isHeadless: () => true,
                isStopping: () => false,
                getProfileOwner: () => deps,
                getLogger: () => ({ warn: () => {}, verbose: () => {}, error: () => {} })
            };
            return new ServerTicker(deps);
        };

        it('never runs an input-lane handler inside a world update, and a read-lane one on arrival', async () => {
            const order: string[] = [];
            let tick = 0;
            const { transport, dispatcher } = makeSessionDispatcher({
                tick: () => tick,
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);
            await transport.emitConnect(fakeConnection(2).connection);
            const arrivals: Promise<void>[] = [];
            const ticker = tickerOver(dispatcher, [
                {
                    getName: () => 'world',
                    update: async (at) => {
                        order.push(`world:${at}:start`);
                        if (at === 0) {
                            // Both arrive in the middle of the update, between its awaits.
                            arrivals.push(transport.emitFrame(frameOf(message('move')), 1));
                            arrivals.push(transport.emitFrame(frameOf(cacheStatus()), 2));
                            await turn();
                            await turn();
                        }
                        order.push(`world:${at}:end`);
                    }
                }
            ]);

            await ticker.advance();
            tick = 1;
            await ticker.advance();
            await Promise.all(arrivals);

            expect(order).toEqual([
                'world:0:start',
                'read',
                'world:0:end',
                // Held until the input step of the next tick, ahead of that tick's update.
                'input:move',
                'world:1:start',
                'world:1:end'
            ]);
        });

        it('applies a handler that takes a context in the input step, with the session and its tick', async () => {
            const seen: string[] = [];
            const { transport, dispatcher } = makeSessionDispatcher({
                tick: () => 5,
                session: { session: stub<PlayerSession>({ identity: STEVE }), phase: 'play' },
                contextHandler: {
                    lane: 'input',
                    phases: ['play'],
                    handle: (_packet, { session, step }) => {
                        seen.push(`${session.identity.name} at ${step.tick}`);
                        return undefined;
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);
            await transport.emitFrame(frameOf(message('move')), 1);

            expect(seen).toEqual([]);
            expect(await dispatcher.admitInputs()).toBe(1);
            expect(seen).toEqual(['Steve at 5']);
        });

        it('applies every input a connection sent before a step in that step, and a later read after it', async () => {
            const order: string[] = [];
            const { transport, dispatcher } = makeSessionDispatcher({
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const arrivals = [
                transport.emitFrame(frameOf(message('first')), 1),
                transport.emitFrame(frameOf(message('second')), 1),
                transport.emitFrame(frameOf(message('third')), 1),
                transport.emitFrame(frameOf(cacheStatus()), 1)
            ];
            // Every frame is decoded and passed on without waiting for a tick.
            await Promise.all(arrivals);
            await turn();
            expect(order).toEqual([]);
            expect(dispatcher.pendingInputs).toBe(3);

            expect(await dispatcher.admitInputs()).toBe(3);
            await turn();
            // The read arrived after held inputs, so it runs once the step that applied them is over.
            expect(order).toEqual(['input:first', 'input:second', 'input:third', 'read']);
            expect(dispatcher.pendingInputs).toBe(0);
        });

        it('applies the inputs of one batch in one step, in batch order', async () => {
            const order: string[] = [];
            const { transport, dispatcher } = makeSessionDispatcher({
                lanes: { TextPacket: 'input' },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(batchOf([message('a'), message('b'), message('c')]), 1);
            expect(dispatcher.pendingInputs).toBe(3);

            expect(await dispatcher.admitInputs()).toBe(3);
            expect(order).toEqual(['input:a', 'input:b', 'input:c']);
            expect(dispatcher.pendingInputs).toBe(0);
        });

        it('keeps no more than one tick of backlog for a client that sends an input and a read every tick', async () => {
            const order: string[] = [];
            const { transport, dispatcher } = makeSessionDispatcher({
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const backlog: number[] = [];
            for (let tick = 0; tick < 100; tick++) {
                await transport.emitFrame(frameOf(message(`${tick}`)), 1);
                await transport.emitFrame(frameOf(cacheStatus()), 1);
                await dispatcher.admitInputs();
                await turn();
                backlog.push(dispatcher.pendingInputs);
            }

            expect(Math.max(...backlog)).toBe(0);
            expect(order).toEqual(Array.from({ length: 100 }, (_unused, tick) => [`input:${tick}`, 'read']).flat());
        });

        it('runs reads from a connection with no held input on arrival, in arrival order', async () => {
            const order: string[] = [];
            const { transport, dispatcher } = makeSessionDispatcher({
                lanes: { TextPacket: 'read' },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await Promise.all([
                transport.emitFrame(frameOf(message('one')), 1),
                transport.emitFrame(frameOf(message('two')), 1),
                transport.emitFrame(batchOf([message('three'), message('four')]), 1)
            ]);

            expect(order).toEqual(['input:one', 'input:two', 'input:three', 'input:four']);
            expect(dispatcher.pendingInputs).toBe(0);
        });

        it('keeps reads that follow a held input in order, behind the step, without holding later inputs back', async () => {
            const order: string[] = [];
            let releaseRead!: () => void;
            const readGate = new Promise<void>((resolve) => (releaseRead = resolve));
            const { transport, dispatcher } = makeSessionDispatcher({
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        const name = nameOf(packet);
                        order.push(`${name}:start`);
                        if (name === 'read' && !order.includes('read:end')) await readGate;
                        order.push(`${name}:end`);
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('one')), 1);
            await transport.emitFrame(frameOf(cacheStatus()), 1);
            await transport.emitFrame(frameOf(cacheStatus()), 1);
            await transport.emitFrame(frameOf(message('two')), 1);
            expect(dispatcher.pendingInputs).toBe(2);

            await dispatcher.admitInputs();
            await turn();
            // The first read waits on something of its own; the second keeps its place behind it.
            expect(order).toEqual([
                'input:one:start',
                'input:one:end',
                'input:two:start',
                'input:two:end',
                'read:start'
            ]);

            // An input sent meanwhile is held at once, and the next step applies it.
            await transport.emitFrame(frameOf(message('three')), 1);
            expect(dispatcher.pendingInputs).toBe(1);
            await dispatcher.admitInputs();
            expect(order.at(-1)).toBe('input:three:end');

            releaseRead();
            await turn();
            expect(order.filter((entry) => entry.startsWith('read'))).toEqual([
                'read:start',
                'read:end',
                'read:start',
                'read:end'
            ]);
        });

        it('gates a packet behind a held input on the phase that input leaves the connection in', async () => {
            const order: string[] = [];
            const { transport, built, dispatcher } = makeSessionDispatcher({
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                phasesOf: { ClientCacheStatusPacket: ['play'] },
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                        // Like the resource pack response that starts the game.
                        built[0]!.phase = 'play';
                        built[0]!.getPlayerSession = () => stub<PlayerSession>();
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(batchOf([message('join'), cacheStatus()]), 1);
            await dispatcher.admitInputs();
            await turn();

            expect(order).toEqual(['input:join', 'read']);
        });

        it('admits at most its budget of inputs in a step, whatever the backlog, and the rest in order after', async () => {
            for (const backlog of [5, 50]) {
                const handled: string[] = [];
                const { transport, dispatcher } = makeSessionDispatcher({
                    lanes: { TextPacket: 'input' },
                    handler: {
                        phases: ['play'],
                        handle: async (packet) => {
                            handled.push(nameOf(packet));
                        }
                    }
                });
                const arrivals: Promise<void>[] = [];
                for (let index = 0; index < backlog; index++) {
                    await transport.emitConnect(fakeConnection(index).connection);
                    arrivals.push(transport.emitFrame(frameOf(message(`${index}`)), index));
                }
                await turn();
                await turn();
                expect(dispatcher.pendingInputs).toBe(backlog);

                const steps: number[] = [];
                while (dispatcher.pendingInputs > 0) steps.push(await dispatcher.admitInputs(4));
                await Promise.all(arrivals);

                expect(Math.max(...steps)).toBeLessThanOrEqual(4);
                expect(handled).toEqual(Array.from({ length: backlog }, (_unused, index) => `input:${index}`));
            }
        });

        it('stamps a captured input with the tick whose input step applied it', async () => {
            const trace = new InboundPacketTrace();
            let tick = 10;
            const { transport, dispatcher } = makeSessionDispatcher({
                recorder: trace,
                tick: () => tick,
                lanes: { TextPacket: 'input' },
                handler: { phases: ['play'], handle: async () => {} }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            // Arrives while tick 10 runs; the next input step is tick 11's.
            const arrival = transport.emitFrame(frameOf(message('move')), 1);
            await turn();
            tick = 11;
            await dispatcher.admitInputs();
            await arrival;

            expect(trace.records().map((record) => record.tick)).toEqual([11]);
        });

        it('A replay applies each recorded input at the tick the capture stamped', async () => {
            // Capture: inputs arrive mid-tick and are applied, and stamped, at later input steps.
            const trace = new InboundPacketTrace();
            const capturedAt: Array<[string, number]> = [];
            let tick = 20;
            const handler = (applied: Array<[string, number]>) => ({
                phases: ['play'] as const,
                handle: async (packet: unknown) => {
                    applied.push([nameOf(packet), tick]);
                }
            });
            const live = makeSessionDispatcher({
                recorder: trace,
                tick: () => tick,
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                handler: handler(capturedAt)
            });
            await live.transport.emitConnect(fakeConnection(1).connection);
            const arrivals = [live.transport.emitFrame(frameOf(message('one')), 1)];
            await turn();
            tick = 21;
            await live.dispatcher.admitInputs();
            arrivals.push(live.transport.emitFrame(frameOf(cacheStatus()), 1));
            arrivals.push(live.transport.emitFrame(frameOf(message('two')), 1));
            await turn();
            tick = 22;
            await live.dispatcher.admitInputs();
            await Promise.all(arrivals);
            expect(trace.records().map((record) => record.tick)).toEqual([21, 21, 22]);

            // Replay: each record is offered before its tick runs, and applied in that tick.
            let replayTick = 30;
            const replayedAt: Array<[string, number]> = [];
            const replay = makeSessionDispatcher({
                tick: () => replayTick,
                lanes: { TextPacket: 'input', ClientCacheStatusPacket: 'read' },
                handler: {
                    phases: ['play'],
                    handle: async (packet: unknown) => {
                        replayedAt.push([nameOf(packet), replayTick]);
                    }
                }
            });
            await replay.transport.emitConnect(fakeConnection(1).connection);
            const offset = 30 - 20;
            const applied: Promise<void>[] = [];
            for (const at of [20, 21, 22]) {
                replayTick = at + offset;
                for (const record of trace.records().filter((each) => each.tick === at)) {
                    applied.push(replay.dispatcher.replayInboundRecord(record, offset));
                }
                await turn();
                await replay.dispatcher.admitInputs();
                await turn();
            }
            await Promise.all(applied);

            expect(replayedAt).toEqual(capturedAt.map(([name, at]) => [name, at + offset]));
            expect(replayedAt).toEqual([
                ['input:one', 31],
                ['read', 31],
                ['input:two', 32]
            ]);
        });

        it('rejects a replayed input whose input step runs in another tick than its record', async () => {
            const trace = new InboundPacketTrace();
            let tick = 4;
            const live = makeSessionDispatcher({
                recorder: trace,
                tick: () => tick,
                lanes: { TextPacket: 'input' },
                handler: { phases: ['play'], handle: async () => {} }
            });
            await live.transport.emitConnect(fakeConnection(1).connection);
            const arrival = live.transport.emitFrame(frameOf(message('move')), 1);
            await turn();
            await live.dispatcher.admitInputs();
            await arrival;

            const replay = makeSessionDispatcher({
                tick: () => tick,
                lanes: { TextPacket: 'input' },
                handler: { phases: ['play'], handle: async () => {} }
            });
            await replay.transport.emitConnect(fakeConnection(1).connection);
            const replayed = replay.dispatcher.replayInboundRecord(trace.records()[0]!);
            await turn();
            tick = 5;
            await replay.dispatcher.admitInputs();

            await expect(replayed).rejects.toThrow('Replay packet tick 4 does not match server tick 5');
        });

        it("applies a player's removal by a closed transport at the next input step, after its inputs", async () => {
            const order: string[] = [];
            const { transport, dispatcher } = makeSessionDispatcher({
                // The removal reads whether the player is in its world, and an input runs in a unit of it.
                session: {
                    session: stub<PlayerSession>({
                        identity: STEVE,
                        getWorld: () => stub<World>({ viewerOf: () => undefined, runInputNow: (apply) => apply() })
                    }),
                    phase: 'play'
                },
                lanes: { TextPacket: 'input' },
                onClosePlayerSession: () => void order.push('removed'),
                handler: {
                    phases: ['play'],
                    handle: async (packet) => {
                        order.push(nameOf(packet));
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            const arrival = transport.emitFrame(frameOf(message('last move')), 1);
            await turn();
            const closed = transport.emitDisconnect(1, 'client disconnected');
            await turn();
            expect(order).toEqual([]);
            expect(dispatcher.pendingInputs).toBe(2);

            await dispatcher.admitInputs();
            await Promise.all([arrival, closed]);
            expect(order).toEqual(['input:last move', 'removed']);
        });
    });
});
