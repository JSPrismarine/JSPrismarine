import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type { InetAddress } from '@jsprismarine/raknet';
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
import type { SessionPhase } from './SessionPhase';
import type { Transport, TransportCapabilities, TransportConnection } from './transport/Transport';
import { TextPacketType } from '@jsprismarine/protocol';

/** A transport the test drives by hand: subscriptions in, emit helpers out. */
class FakeTransport implements Transport<TransportConnection> {
    private connect: ((connection: TransportConnection) => Promise<void> | void) | undefined;
    private frame: ((payload: Buffer, address: InetAddress) => Promise<void> | void) | undefined;

    public onConnect(listener: (connection: TransportConnection) => Promise<void> | void): void {
        this.connect = listener;
    }

    public onDisconnect(): void {}

    public onFrame(listener: (payload: Buffer, address: InetAddress) => Promise<void> | void): void {
        this.frame = listener;
    }

    public onRaw(): void {}

    public close(): void {}

    public async emitConnect(connection: TransportConnection): Promise<void> {
        await this.connect?.(connection);
    }

    public async emitFrame(payload: Buffer, address: InetAddress): Promise<void> {
        await this.frame?.(payload, address);
    }
}

const capabilities: TransportCapabilities = {
    encrypted: false,
    reliableOrdered: true,
    maxFrameSize: Number.POSITIVE_INFINITY
};

/** A connection that records whether (and why) it was refused. */
const fakeConnection = (token: string) => {
    const closed: (string | undefined)[] = [];
    const connection: TransportConnection = {
        token,
        capabilities,
        sendFrame: () => {},
        close: (reason) => void closed.push(reason)
    };

    return { connection, closed };
};

/** A logger that records each level's lines. */
const fakeLogger = () => {
    const lines: { level: string; message: string }[] = [];
    const record = (level: string) => (message: unknown) => void lines.push({ level, message: String(message) });
    const logger = stub<Logger>({
        error: record('error'),
        warn: record('warn'),
        info: record('info'),
        debug: record('debug'),
        verbose: record('verbose'),
        silly: record('silly')
    });

    return { logger, lines };
};

const address = (token: string) => stub<InetAddress>({ toToken: () => token });

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

/** One uncompressed batch holding the packet, as bytes off the wire. */
const frameOf = (packet: TextPacket) => {
    packet.encode();
    return BatchCodec.uncompressed().encode([packet.getBuffer()]);
};

/** Wires a dispatcher over typed doubles; each test picks the registry and connections. */
const makeDispatcher = (options?: {
    codec?: ProtocolCodec;
    handler?: {
        phases: readonly SessionPhase[];
        handle: (packet: unknown, server: Server, target: unknown) => Promise<void>;
    };
}) => {
    const transport = new FakeTransport();
    const sessionManager = new SessionManager();
    const { logger, lines } = fakeLogger();
    const server = stub<Server>();
    const packetHandlerRegistry = stub<PacketHandlerRegistry>({
        getHandler: () => {
            if (!options?.handler) throw new Error('no handler registered');
            return options.handler;
        }
    });
    const built: ClientConnection[] = [];

    new NetworkDispatcher({
        transport,
        sessionManager,
        packetHandlerRegistry,
        events: stub<EventEmitter>({ emit: async () => {} }),
        server,
        logger,
        logFilter: new PacketLogFilter(),
        createConnection: () => {
            const connection = stub<ClientConnection>({
                hasCompression: false,
                codec: options?.codec ?? Codec2193,
                phase: 'handshake',
                getPlayerSession: () => null
            });
            built.push(connection);
            return connection;
        },
        query: { enabled: () => false, onRaw: async () => Buffer.alloc(0) }
    });

    return { transport, sessionManager, lines, server, built };
};

describe('network', () => {
    describe('NetworkDispatcher', () => {
        it('admits a connection into the session registry under its token', async () => {
            const { transport, sessionManager, built } = makeDispatcher();

            await transport.emitConnect(fakeConnection('a:1').connection);

            expect(sessionManager.get('a:1')).toBe(built[0]);
        });

        it('refuses a second connection with the token of a live one', async () => {
            const { transport, sessionManager, lines, built } = makeDispatcher();
            await transport.emitConnect(fakeConnection('a:1').connection);

            const { connection, closed } = fakeConnection('a:1');
            await transport.emitConnect(connection);

            expect(closed).toStrictEqual(['Already connected from another location']);
            expect(built).toHaveLength(1);
            expect(sessionManager.get('a:1')).toBe(built[0]);
            expect(lines.some(({ level, message: m }) => level === 'error' && m.includes('already connected'))).toBe(
                true
            );
        });

        it('warns about a packet id nothing is registered for, and keeps going', async () => {
            const { transport, lines } = makeDispatcher({ codec: stub<ProtocolCodec>({ createPacket: () => null }) });
            await transport.emitConnect(fakeConnection('a:1').connection);

            await transport.emitFrame(frameOf(message('hello')), address('a:1'));

            expect(lines.some(({ level, message: m }) => level === 'warn' && m.includes("isn't implemented"))).toBe(
                true
            );
        });

        it('rejects a frame from a connection the registry no longer holds', async () => {
            const { transport, lines } = makeDispatcher();

            await transport.emitFrame(frameOf(message('ghost')), address('gone:0'));

            expect(lines.some(({ level, message: m }) => level === 'error' && m.includes('closed connection'))).toBe(
                true
            );
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
            await transport.emitConnect(fakeConnection('a:1').connection);

            await transport.emitFrame(frameOf(message('login')), address('a:1'));

            expect(targets).toStrictEqual([built[0]]);
        });

        it('drops a handshake packet once the connection has left the handshake phase', async () => {
            const targets: unknown[] = [];
            const { transport, built, lines } = makeDispatcher({
                handler: {
                    phases: ['handshake'],
                    handle: async (_packet, _server, target) => void targets.push(target)
                }
            });
            await transport.emitConnect(fakeConnection('a:1').connection);
            built[0]!.phase = 'play';
            built[0]!.getPlayerSession = () => stub<PlayerSession>();

            await transport.emitFrame(frameOf(message('late')), address('a:1'));

            expect(targets).toHaveLength(0);
            expect(
                lines.some(({ level, message: m }) => level === 'debug' && m.includes('not accepted in the play phase'))
            ).toBe(true);
        });

        it('hands a play-phase handler the player session once login has created one', async () => {
            const session = stub<PlayerSession>();
            const targets: unknown[] = [];
            const { transport, built } = makeDispatcher({
                handler: { phases: ['play'], handle: async (_packet, _server, target) => void targets.push(target) }
            });
            await transport.emitConnect(fakeConnection('a:1').connection);
            built[0]!.phase = 'play';
            built[0]!.getPlayerSession = () => session;

            await transport.emitFrame(frameOf(message('chat')), address('a:1'));

            expect(targets).toStrictEqual([session]);
        });

        it('drops a play packet that arrives before login has completed', async () => {
            const targets: unknown[] = [];
            const { transport, lines } = makeDispatcher({
                handler: { phases: ['play'], handle: async (_packet, _server, target) => void targets.push(target) }
            });
            await transport.emitConnect(fakeConnection('a:1').connection);

            await transport.emitFrame(frameOf(message('early')), address('a:1'));

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
            await transport.emitConnect(fakeConnection('a:1').connection);
            built[0]!.phase = 'play';

            await transport.emitFrame(frameOf(message('early')), address('a:1'));

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
            await transport.emitConnect(fakeConnection('a:1').connection);

            await transport.emitFrame(frameOf(message('boom')), address('a:1'));

            expect(lines.some(({ level, message: m }) => level === 'error' && m.includes('Handler error'))).toBe(true);
        });
    });
});
