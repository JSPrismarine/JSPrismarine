import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { InetAddress } from '@jsprismarine/raknet';
import { settle } from '../../testing/manualTransport.test.helper';
import { ConnectionIds } from './ConnectionId';
import NetherNetTransport, {
    candidateAddress,
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

        it('closes the peer with the reason', () => {
            const { connection: under, closed } = connection();

            under.close('Kicked');

            expect(closed).toStrictEqual(['Kicked']);
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
