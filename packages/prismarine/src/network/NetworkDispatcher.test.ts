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
import type { InboundPacketRecorder } from './InboundPacketTrace';
import { InboundPacketTrace } from './InboundPacketTrace';
import type { OutboundPacketRecorder } from './OutboundPacketTrace';
import type { SessionPhase } from './SessionPhase';
import type { ConnectionId } from './transport/ConnectionId';
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

/** One batch holding the packet, as bytes off the wire. */
const frameOf = (packet: TextPacket, compressed = false) => {
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
const makeDispatcher = (options?: {
    codec?: ProtocolCodec;
    recorder?: InboundPacketRecorder;
    outboundRecorder?: OutboundPacketRecorder;
    compressed?: boolean;
    tick?: () => number;
    loggerEnabled?: boolean;
    logFilter?: PacketLogFilter;
    handler?: {
        phases: readonly SessionPhase[];
        handle: (packet: unknown, server: Server, target: unknown) => Promise<void>;
    };
}) => {
    const transport = new FakeTransport();
    const sessionManager = new SessionManager();
    const { logger, lines } = fakeLogger(options?.loggerEnabled ?? true);
    const logFilter = options?.logFilter ?? new PacketLogFilter();
    const server = stub<Server>({ getTick: options?.tick ?? (() => 0) });
    const packetHandlerRegistry = stub<PacketHandlerRegistry>({
        getHandler: () => {
            if (!options?.handler) throw new Error('no handler registered');
            return options.handler;
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
                phase: 'handshake',
                decryptFrame: (frame) => frame,
                getPlayerSession: () => null,
                closePlayerSession: async () => {},
                setOutboundPacketRecorder: (recorder, connectionId, getTick) =>
                    void outboundRecorderSetup.push({ recorder, connectionId, getTick })
            });
            built.push(connection);
            return connection;
        },
        query: { enabled: () => false, onRaw: async () => Buffer.alloc(0) }
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

        it('hands a handshake-phase handler the bare connection', async () => {
            const targets: unknown[] = [];
            const { transport, built, server } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async (_packet, givenServer, target) => {
                        expect(givenServer).toBe(server);
                        targets.push(target);
                    }
                }
            });
            await transport.emitConnect(fakeConnection(1).connection);

            await transport.emitFrame(frameOf(message('login')), 1);

            expect(targets).toStrictEqual([built[0]]);
        });

        it('records accepted packet bytes with global order, connection order, and arrival tick', async () => {
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
            await transport.emitDisconnect(1, 'client disconnected');

            releaseLive();
            await liveFrame;
            await expect(replay).rejects.toThrow('Replay connection 1 is no longer connected');
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

        it('keeps the arrival tick when a prior handler holds the connection queue', async () => {
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

            expect(trace.records().map((record) => record.tick)).toEqual([7, 8]);
        });

        it('drops a handshake packet once the connection has left the handshake phase', async () => {
            const targets: unknown[] = [];
            const { transport, built, lines } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async (_packet, _server, target) => void targets.push(target)
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

        it('hands a play-phase handler the player session once login has created one', async () => {
            const session = stub<PlayerSession>();
            const trace = new InboundPacketTrace();
            const targets: unknown[] = [];
            const { transport, built } = makeDispatcher({
                recorder: trace,
                handler: { phases: ['play'], handle: async (_packet, _server, target) => void targets.push(target) }
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
                handler: { phases: ['play'], handle: async (_packet, _server, target) => void targets.push(target) }
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
                handler: { phases: ['play'], handle: async (_packet, _server, target) => void targets.push(target) }
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
});
