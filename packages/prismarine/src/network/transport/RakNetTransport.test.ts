import { EventEmitter as NodeEventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import type { Frame, InetAddress, RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import type { Event } from '../../events/Event';
import type { EventEmitter } from '../../events/EventEmitter';
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
const fakeSession = (token = 'host:port') => {
    const sent: { frame: Frame; priority: number }[] = [];
    const disconnects: string[] = [];
    const session = stub<RakNetSession>({
        getAddress: () => stub<InetAddress>({ toToken: () => token }),
        sendFrame: (frame: Frame, priority?: number) =>
            void sent.push({ frame, priority: priority ?? ConnectionPriority.NORMAL }),
        disconnect: (reason?: string) => void disconnects.push(reason ?? 'client disconnect')
    });

    return { session, sent, disconnects };
};

/** A server bus that records every legacy event, optionally canceling as it goes. */
const fakeBus = (onEvent?: (event: Event) => void) => {
    const emitted: [string, Event][] = [];
    const bus = stub<EventEmitter>({
        emit: async (id: string, event: Event) => {
            emitted.push([id, event]);
            onEvent?.(event);
        }
    });

    return { bus, emitted };
};

/** The transport delivers through awaited async handlers; this lets them settle. */
const settled = () => new Promise((resolve) => setImmediate(resolve));

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
            transport.onConnect((connection) => void connected.push(connection));

            const { session } = fakeSession('1.2.3.4:19132');
            listener.emit('openConnection', session);
            await settled();

            expect(emitted.map(([id]) => id)).toStrictEqual(['raknetConnect']);
            expect(emitted[0]![1]).toBeInstanceOf(RaknetConnectEvent);
            expect(connected).toHaveLength(1);
            expect(connected[0]!.token).toBe('1.2.3.4:19132');
            expect(connected[0]!.getRakNetSession()).toBe(session);
        });

        it('disconnects a session whose connect event was canceled, and tells nobody', async () => {
            const listener = new FakeListener();
            const { bus } = fakeBus((event) => event.preventDefault());
            const transport = new RakNetTransport(listener, bus);
            const connected: RakNetTransportConnection[] = [];
            transport.onConnect((connection) => void connected.push(connection));

            const { session, disconnects } = fakeSession();
            listener.emit('openConnection', session);
            await settled();

            expect(disconnects).toStrictEqual(['client disconnect']);
            expect(connected).toHaveLength(0);
        });

        it('maps encapsulated to frame, handing on the content bytes', async () => {
            const listener = new FakeListener();
            const { bus, emitted } = fakeBus();
            const transport = new RakNetTransport(listener, bus);
            const frames: [Buffer, string][] = [];
            transport.onFrame((payload, address) => void frames.push([payload, address.toToken()]));

            const frame = new Protocol.Frame();
            frame.content = Buffer.from('batch');
            const address = stub<InetAddress>({ toToken: () => 'a:1' });
            listener.emit('encapsulated', frame, address);
            await settled();

            expect(emitted.map(([id]) => id)).toStrictEqual(['raknetEncapsulatedPacket']);
            const event = emitted[0]![1];
            if (!(event instanceof RaknetEncapsulatedPacketEvent)) throw new Error('wrong event emitted');
            expect(event.getPacket()).toBe(frame);
            expect(frames).toStrictEqual([[Buffer.from('batch'), 'a:1']]);
        });

        it('forwards closeConnection as disconnect with the reason', async () => {
            const listener = new FakeListener();
            const transport = new RakNetTransport(listener, fakeBus().bus);
            const gone: [string, string][] = [];
            transport.onDisconnect((address, reason) => void gone.push([address.toToken(), reason]));

            listener.emit('closeConnection', stub<InetAddress>({ toToken: () => 'b:2' }), 'timeout');
            await settled();

            expect(gone).toStrictEqual([['b:2', 'timeout']]);
        });

        it('keeps the raw event for the query protocol', async () => {
            const listener = new FakeListener();
            const transport = new RakNetTransport(listener, fakeBus().bus);
            const raw: Buffer[] = [];
            transport.onRaw((payload) => void raw.push(payload));

            listener.emit('raw', Buffer.from('query'), stub<InetAddress>({ toToken: () => 'c:3' }));
            await settled();

            expect(raw).toStrictEqual([Buffer.from('query')]);
        });

        it('kills the listener on close', () => {
            const listener = new FakeListener();
            new RakNetTransport(listener, fakeBus().bus).close();

            expect(listener.killed).toBe(true);
        });
    });
});
