import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { InetAddress } from '@jsprismarine/raknet';
import { settle } from '../../testing/manualTransport.test.helper';
import { ConnectionIds } from './ConnectionId';
import NetherNetTransport, {
    candidateAddress,
    hasUndeliveredData,
    NETHERNET_DRAIN_TIMEOUT_MS,
    NetherNetTransportConnection,
    selectedCandidateAddress
} from './NetherNetTransport';
import type { NetherNetPeer } from './NetherNetTransport';

/** The `nethernet` server's event surface, with a recorded `close`. */
class FakeNetherNetServer extends EventEmitter {
    public closedWith: (string | undefined)[] = [];

    public close(reason?: string): void {
        this.closedWith.push(reason);
    }
}

/** A peer that records what it was sent and why it was closed. */
const fakePeer = (connectionId: bigint, rtcConnection?: unknown) => {
    const sent: Buffer[] = [];
    const closed: (string | undefined)[] = [];
    const peer: NetherNetPeer = {
        address: connectionId,
        rtcConnection,
        closed: false,
        send: (data) => {
            sent.push(Buffer.from(data));
            return data.byteLength;
        },
        close: (reason) => void closed.push(reason)
    };
    return { peer, sent, closed };
};

/** What werift's peer connection exposes once ICE has chosen a pair. */
const weriftConnection = (remoteCandidate: string) => ({
    iceTransports: [{ getSelectedCandidatePair: () => ({ local: {}, remote: { candidate: remoteCandidate } }) }]
});

const batch = (body: string) => Buffer.concat([Buffer.from([BATCH_PACKET_ID]), Buffer.from(body)]);

describe('network/transport/NetherNetTransport', () => {
    describe('NetherNetTransportConnection', () => {
        const connection = () => {
            const { peer, sent, closed } = fakePeer(9n);
            return {
                connection: new NetherNetTransportConnection(3, peer, new InetAddress('192.0.2.1', 5)),
                sent,
                closed
            };
        };

        it('says the wire is encrypted, so the login skips its own encryption', () => {
            expect(connection().connection.capabilities.encrypted).toBe(true);
        });

        it('sends a batch without the 0xFE id NetherNet leaves out', () => {
            const { connection: under, sent } = connection();

            under.sendFrame(batch('packets'));

            expect(sent).toStrictEqual([Buffer.from('packets')]);
        });

        it('refuses a frame that is not a batch', () => {
            expect(() => connection().connection.sendFrame(Buffer.from([0x01, 0x02]))).toThrow(
                'A NetherNet frame must be a batch, got id 0x1'
            );
        });

        it('refuses a frame larger than one NetherNet message', () => {
            const { connection: under, sent } = connection();
            const tooLarge = Buffer.alloc(under.capabilities.maxFrameSize + 1, 0);
            tooLarge[0] = BATCH_PACKET_ID;

            expect(() => under.sendFrame(tooLarge)).toThrow(RangeError);
            expect(sent).toStrictEqual([]);
        });

        it('drops a frame for a peer that has closed instead of throwing', () => {
            const { peer, sent } = fakePeer(9n);
            const under = new NetherNetTransportConnection(
                3,
                { ...peer, closed: true },
                new InetAddress('192.0.2.1', 5)
            );

            under.sendFrame(batch('late'));

            expect(sent).toStrictEqual([]);
        });

        it('closes the peer with the reason', async () => {
            const { connection: under, closed } = connection();

            await under.close('Kicked');

            expect(closed).toStrictEqual(['Kicked']);
        });

        describe('hanging up', () => {
            /** A peer over a werift-shaped reliable channel whose backlog the test controls. */
            const drainingPeer = () => {
                const association = { flightSize: 0, outboundQueue: [] as unknown[] };
                const reliable = { bufferedAmount: 0, sctp: { sctp: association } };
                const closed: (string | undefined)[] = [];
                const peer = {
                    address: 9n,
                    reliable,
                    closed: false,
                    send: (data: Buffer) => data.byteLength,
                    close: (reason?: string) => void closed.push(reason)
                };
                const under = new NetherNetTransportConnection(3, peer, new InetAddress('192.0.2.1', 5));
                return { peer, reliable, association, closed, under };
            };

            beforeEach(() => {
                vi.useFakeTimers();
            });

            afterEach(() => {
                vi.useRealTimers();
            });

            it('waits until the client has acknowledged everything sent before it', async () => {
                const { reliable, association, closed, under } = drainingPeer();
                reliable.bufferedAmount = 120;

                const closing = under.close('Server closed.');
                await vi.advanceTimersByTimeAsync(50);
                expect(closed).toStrictEqual([]);

                // Handed to SCTP, but sent and not yet acknowledged.
                reliable.bufferedAmount = 0;
                association.flightSize = 120;
                await vi.advanceTimersByTimeAsync(50);
                expect(closed).toStrictEqual([]);

                association.flightSize = 0;
                association.outboundQueue.push({});
                await vi.advanceTimersByTimeAsync(50);
                expect(closed).toStrictEqual([]);

                association.outboundQueue.length = 0;
                await vi.advanceTimersByTimeAsync(50);
                await closing;
                expect(closed).toStrictEqual(['Server closed.']);
            });

            it('stops waiting once the client hangs up itself', async () => {
                const { peer, reliable, closed, under } = drainingPeer();
                reliable.bufferedAmount = 120;

                const closing = under.close('Kicked');
                peer.closed = true;
                await vi.advanceTimersByTimeAsync(50);
                await closing;

                expect(closed).toStrictEqual(['Kicked']);
            });

            it('hangs up anyway when the client never acknowledges', async () => {
                const { association, closed, under } = drainingPeer();
                association.flightSize = 1;

                const closing = under.close('Kicked');
                await vi.advanceTimersByTimeAsync(NETHERNET_DRAIN_TIMEOUT_MS - 50);
                expect(closed).toStrictEqual([]);

                await vi.advanceTimersByTimeAsync(50);
                await closing;
                expect(closed).toStrictEqual(['Kicked']);
            });
        });
    });

    describe('hasUndeliveredData', () => {
        it('knows nothing about a backend that exposes no send buffer', () => {
            expect(hasUndeliveredData(fakePeer(1n).peer)).toBeUndefined();
        });

        it('counts a channel with nothing buffered and no association as delivered', () => {
            expect(hasUndeliveredData({ ...fakePeer(1n).peer, reliable: { bufferedAmount: 0 } })).toBe(false);
        });
    });

    describe('NetherNetTransport', () => {
        it("announces an opened peer under a server-allocated ID, at the ICE pair's address", async () => {
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const connected: NetherNetTransportConnection[] = [];
            transport.onConnect((connection) => void connected.push(connection));

            source.emit(
                'openConnection',
                fakePeer(0xffff_ffff_ffffn, weriftConnection('candidate:1 1 udp 2130706431 192.0.2.7 50123 typ host'))
                    .peer
            );
            await settle();

            expect(connected.map((connection) => [connection.id, connection.address.toString()])).toStrictEqual([
                [1, '192.0.2.7:50123']
            ]);
        });

        it('reports an unknown address when nothing says where the peer is', async () => {
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const connected: NetherNetTransportConnection[] = [];
            transport.onConnect((connection) => void connected.push(connection));

            source.emit('openConnection', fakePeer(1n).peer);
            await settle();

            expect(connected[0]!.address.toString()).toBe('0.0.0.0:0');
        });

        it('hands on each message as a batch, with the 0xFE id put back', async () => {
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const frames: [Buffer, number][] = [];
            transport.onFrame((payload, id) => void frames.push([payload, id]));

            source.emit('openConnection', fakePeer(7n).peer);
            source.emit('encapsulated', Buffer.from('packets'), 7n);
            source.emit('encapsulated', Buffer.from('stray'), 8n);
            await settle();

            expect(frames).toStrictEqual([[batch('packets'), 1]]);
        });

        it('keeps the messages a peer sends before it opens, and hands them on once it does', async () => {
            // A client sends its first packet once its reliable channel opens, which can be before
            // `nethernet` says the peer is open.
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const frames: [Buffer, number][] = [];
            transport.onFrame((payload, id) => void frames.push([payload, id]));

            source.emit('encapsulated', Buffer.from('first'), 7n);
            source.emit('encapsulated', Buffer.from('second'), 7n);
            source.emit('openConnection', fakePeer(7n).peer);
            source.emit('encapsulated', Buffer.from('third'), 7n);
            await settle();

            expect(frames).toStrictEqual([
                [batch('first'), 1],
                [batch('second'), 1],
                [batch('third'), 1]
            ]);
        });

        it('forgets the early messages of a peer that closes before it opens', async () => {
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const frames: Buffer[] = [];
            transport.onFrame((payload) => void frames.push(payload));

            source.emit('encapsulated', Buffer.from('stale'), 7n);
            source.emit('closeConnection', 7n, 'connecterror:15');
            source.emit('openConnection', fakePeer(7n).peer);
            await settle();

            expect(frames).toStrictEqual([]);
        });

        it('reports a close with the ID and address the peer opened with', async () => {
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(
                source,
                new ConnectionIds(),
                () => new InetAddress('192.0.2.9', 1)
            );
            const gone: string[] = [];
            transport.onDisconnect((id, address, reason) => void gone.push(`${id} ${address} ${reason}`));

            // A peer that never finished opening was never announced, so it is not withdrawn.
            source.emit('closeConnection', 4n, 'connecterror:15');
            source.emit('openConnection', fakePeer(5n).peer);
            source.emit('closeConnection', 5n, 'disconnected');
            await settle();

            expect(gone).toStrictEqual(['1 192.0.2.9:1 disconnected']);
        });

        it('gives a client that reuses its connection ID after a close a new server ID', async () => {
            // The client picks the NetherNet connection ID, so the server never relies on it.
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const ids: number[] = [];
            transport.onConnect((connection) => void ids.push(connection.id));

            source.emit('openConnection', fakePeer(42n).peer);
            source.emit('closeConnection', 42n, 'disconnected');
            source.emit('openConnection', fakePeer(42n).peer);
            await settle();

            expect(ids).toStrictEqual([1, 2]);
        });

        it('closes the nethernet server on close', () => {
            const source = new FakeNetherNetServer();
            new NetherNetTransport(source, new ConnectionIds()).close();

            expect(source.closedWith).toStrictEqual(['Server closed']);
        });
    });

    describe('candidate addresses', () => {
        it('reads the address and port out of a candidate line', () => {
            expect(
                candidateAddress('candidate:842163049 1 udp 1677729535 203.0.113.4 61000 typ srflx')?.toString()
            ).toBe('203.0.113.4:61000');
            expect(candidateAddress('a=candidate:1 1 udp 1 2001:db8::1 5000 typ host')?.toString()).toBe(
                '2001:db8::1:5000'
            );
        });

        it('finds nothing in a line that is not a candidate', () => {
            expect(candidateAddress('candidate:1 1 udp')).toBeUndefined();
            expect(candidateAddress('candidate:1 1 udp 1 192.0.2.1 notaport typ host')).toBeUndefined();
        });

        it('finds nothing in a peer connection that does not expose its chosen pair', () => {
            expect(selectedCandidateAddress(fakePeer(1n, { iceTransports: [] }).peer)).toBeUndefined();
            expect(selectedCandidateAddress(fakePeer(1n, {}).peer)).toBeUndefined();
            expect(selectedCandidateAddress(fakePeer(1n).peer)).toBeUndefined();
        });
    });
});
