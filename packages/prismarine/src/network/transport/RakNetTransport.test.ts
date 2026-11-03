import { EventEmitter as NodeEventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import type { Frame, InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import type { Event } from '../../events/Event';
import type { EventEmitter } from '../../events/EventEmitter';
import { EventEmitter as ServerEventEmitter } from '../../events/EventEmitter';
import RaknetConnectEvent from '../../events/raknet/RaknetConnectEvent';
import RaknetEncapsulatedPacketEvent from '../../events/raknet/RaknetEncapsulatedPacketEvent';
import { stub } from '../../testing/stub.test.helper';
import RakNetTransport, { RakNetTransportConnection } from './RakNetTransport';

/** The listener's event surface with a recorded `kill`, standing in for a real socket. */
class FakeListener extends NodeEventEmitter {
    public killed = false;

    public kill(): void {
        this.killed = true;
    }
}

/** A session that records the frames and disconnects it was asked for. */
const fakeSession = (token = 'host:port', onDisconnect: () => void = () => {}) => {
    const sent: { frame: Frame; priority: number }[] = [];
    const disconnects: string[] = [];
    const session = stub<RakNetSession>({
        getAddress: () => stub<InetAddress>({ toToken: () => token }),
        sendFrame: (frame: Frame, priority?: number) =>
            void sent.push({ frame, priority: priority ?? ConnectionPriority.NORMAL }),
        disconnect: (reason?: string) => {
            disconnects.push(reason ?? 'client disconnect');
            onDisconnect();
        }
    });

    return { session, sent, disconnects };
};

/** A server bus that records every legacy event, optionally canceling as it goes. */
const fakeBus = (onEvent?: (event: Event) => void) => {
    const emitted: [string, Event][] = [];
    const bus = stub<EventEmitter>({
        hasListeners: (id: string) => id === 'raknetEncapsulatedPacket' && onEvent !== undefined,
        emit: async (id: string, event: Event) => {
            emitted.push([id, event]);
            onEvent?.(event);
        }
    });

    return { bus, emitted };
};

/** Wait for the observable callback rather than a timer that another test may fake. */
const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

describe('network/transport', () => {
    describe('RakNetTransportConnection', () => {
        it('frames a payload reliable ordered on channel 0', () => {
            const { session, sent } = fakeSession();
            const connection = new RakNetTransportConnection(session);

            connection.sendFrame(Buffer.from('payload'));

            expect(sent).toHaveLength(1);
            expect(sent[0]!.frame.reliability).toBe(Protocol.FrameReliability.RELIABLE_ORDERED);
            expect(sent[0]!.frame.orderChannel).toBe(0);
            expect(sent[0]!.frame.content.toString()).toBe('payload');
            expect(sent[0]!.priority).toBe(ConnectionPriority.NORMAL);
        });

        it('sends an immediate frame at immediate priority', () => {
            const { session, sent } = fakeSession();
            const connection = new RakNetTransportConnection(session);

            connection.sendFrame(Buffer.from('now'), true);

            expect(sent[0]!.priority).toBe(ConnectionPriority.IMMEDIATE);
        });

        it('keys its identity on the address token', () => {
            const { session } = fakeSession('10.0.0.2:19132');

            expect(new RakNetTransportConnection(session).token).toBe('10.0.0.2:19132');
        });

        it('closes through the session, carrying the reason', () => {
            const { session, disconnects } = fakeSession();
            const connection = new RakNetTransportConnection(session);

            connection.close('Already connected from another location');
            connection.close();

            expect(disconnects).toStrictEqual(['Already connected from another location', 'client disconnect']);
        });
    });

    describe('RakNetTransport', () => {
        it('maps openConnection to connect, after the legacy event has been heard', async () => {
            const listener = new FakeListener();
            const { bus, emitted } = fakeBus();
            const transport = new RakNetTransport(listener, bus);
            const connected: RakNetTransportConnection[] = [];
            const delivered = deferred();
            transport.onConnect((connection) => {
                connected.push(connection);
                delivered.resolve();
            });

            const { session } = fakeSession('1.2.3.4:19132');
            listener.emit('openConnection', session);
            await delivered.promise;

            expect(emitted.map(([id]) => id)).toStrictEqual(['raknetConnect']);
            expect(emitted[0]![1]).toBeInstanceOf(RaknetConnectEvent);
            expect(connected).toHaveLength(1);
            expect(connected[0]!.token).toBe('1.2.3.4:19132');
            expect(connected[0]!.getRakNetSession()).toBe(session);
        });

        it('keeps a session connect, frame, and close in order across async listeners', async () => {
            const listener = new FakeListener();
            let releaseConnect: (() => void) | undefined;
            const connectGate = new Promise<void>((resolve) => {
                releaseConnect = resolve;
            });
            const connectStarted = deferred();
            const bus = stub<EventEmitter>({
                hasListeners: () => false,
                emit: async (id: string) => {
                    if (id === 'raknetConnect') {
                        connectStarted.resolve();
                        await connectGate;
                    }
                }
            });
            const transport = new RakNetTransport(listener, bus);
            const order: string[] = [];
            const disconnected = deferred();
            transport.onConnect(() => void order.push('connect'));
            transport.onFrame(() => void order.push('frame'));
            transport.onDisconnect(() => {
                order.push('close');
                disconnected.resolve();
            });

            const { session } = fakeSession('serial:1');
            const address = session.getAddress();
            const frame = new Protocol.Frame();
            frame.content = Buffer.from('ordered');
            listener.emit('openConnection', session);
            listener.emit('encapsulated', frame, address);
            listener.emit('closeConnection', address, 'closed');
            await connectStarted.promise;
            expect(order).toStrictEqual([]);

            releaseConnect?.();
            await disconnected.promise;
            expect(order).toStrictEqual(['connect', 'frame', 'close']);
        });

        it('disconnects a session whose connect event was canceled, and tells nobody', async () => {
            const listener = new FakeListener();
            const { bus } = fakeBus((event) => event.preventDefault());
            const transport = new RakNetTransport(listener, bus);
            const connected: RakNetTransportConnection[] = [];
            transport.onConnect((connection) => void connected.push(connection));

            const disconnected = deferred();
            const { session, disconnects } = fakeSession('host:port', () => disconnected.resolve());
            listener.emit('openConnection', session);
            await disconnected.promise;

            expect(disconnects).toStrictEqual(['client disconnect']);
            expect(connected).toHaveLength(0);
        });

        it('maps encapsulated to frame, handing on the content bytes', async () => {
            const listener = new FakeListener();
            const order: string[] = [];
            const { bus, emitted } = fakeBus(() => order.push('event'));
            const transport = new RakNetTransport(listener, bus);
            const frames: [Buffer, string][] = [];
            const delivered = deferred();
            transport.onFrame((payload, address) => {
                order.push('frame');
                frames.push([payload, address.toToken()]);
                delivered.resolve();
            });

            const frame = new Protocol.Frame();
            frame.content = Buffer.from('batch');
            const address = stub<InetAddress>({ toToken: () => 'a:1' });
            listener.emit('encapsulated', frame, address);
            await delivered.promise;

            expect(emitted.map(([id]) => id)).toStrictEqual(['raknetEncapsulatedPacket']);
            const event = emitted[0]![1];
            if (!(event instanceof RaknetEncapsulatedPacketEvent)) throw new Error('wrong event emitted');
            expect(event.getInetAddr()).toBe(address);
            expect(event.getPacket()).toBe(frame);
            expect(frames).toStrictEqual([[Buffer.from('batch'), 'a:1']]);
            expect(order).toStrictEqual(['event', 'frame']);
        });

        it('checks the real server bus and awaits the legacy event before the frame listener', async () => {
            const listener = new FakeListener();
            const events = new ServerEventEmitter();
            const order: string[] = [];
            const emitted: RaknetEncapsulatedPacketEvent[] = [];
            const delivered = deferred();
            events.on('raknetEncapsulatedPacket', (event) => {
                order.push('event');
                emitted.push(event);
            });
            const transport = new RakNetTransport(listener, events);
            transport.onFrame(() => {
                order.push('frame');
                delivered.resolve();
            });

            const frame = new Protocol.Frame();
            frame.content = Buffer.from('batch');
            const address = stub<InetAddress>({ toToken: () => 'a:1' });
            listener.emit('encapsulated', frame, address);
            await delivered.promise;

            expect(emitted).toHaveLength(1);
            expect(emitted[0]!.getInetAddr()).toBe(address);
            expect(emitted[0]!.getPacket()).toBe(frame);
            expect(order).toStrictEqual(['event', 'frame']);
        });

        it('skips event construction when no plugin listens and still delivers the frame', async () => {
            const listener = new FakeListener();
            const { bus, emitted } = fakeBus();
            const transport = new RakNetTransport(listener, bus);
            const frames: Buffer[] = [];
            const delivered = deferred();
            transport.onFrame((payload) => {
                frames.push(payload);
                delivered.resolve();
            });

            const frame = new Protocol.Frame();
            frame.content = Buffer.from('batch');
            listener.emit('encapsulated', frame, stub<InetAddress>({ toToken: () => 'a:1' }));
            await delivered.promise;

            expect(emitted).toStrictEqual([]);
            expect(frames).toStrictEqual([Buffer.from('batch')]);
        });

        it('forwards closeConnection as disconnect with the reason', async () => {
            const listener = new FakeListener();
            const transport = new RakNetTransport(listener, fakeBus().bus);
            const gone: [string, string][] = [];
            const delivered = deferred();
            transport.onDisconnect((address, reason) => {
                gone.push([address.toToken(), reason]);
                delivered.resolve();
            });

            listener.emit('closeConnection', stub<InetAddress>({ toToken: () => 'b:2' }), 'timeout');
            await delivered.promise;

            expect(gone).toStrictEqual([['b:2', 'timeout']]);
        });

        it('keeps the raw event for the query protocol', async () => {
            const listener = new FakeListener();
            const transport = new RakNetTransport(listener, fakeBus().bus);
            const raw: Buffer[] = [];
            const delivered = deferred();
            transport.onRaw((payload) => {
                raw.push(payload);
                delivered.resolve();
            });

            listener.emit('raw', Buffer.from('query'), stub<InetAddress>({ toToken: () => 'c:3' }));
            await delivered.promise;

            expect(raw).toStrictEqual([Buffer.from('query')]);
        });

        it('kills the listener on close', () => {
            const listener = new FakeListener();
            new RakNetTransport(listener, fakeBus().bus).close();

            expect(listener.killed).toBe(true);
        });
    });
});
