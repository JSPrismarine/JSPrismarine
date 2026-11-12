import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { InetAddress } from '@jsprismarine/raknet';
import { settle } from '../../testing/manualTransport.test.helper';
import { ConnectionIds } from './ConnectionId';
import NetherNetTransport, { NetherNetTransportConnection, selectedCandidateAddress } from './NetherNetTransport';
import type { NetherNetPeer } from './NetherNetTransport';

/** The NetherNet server's event surface, with a recorded `close`. */
class FakeNetherNetServer extends EventEmitter {
    public closedWith: (string | undefined)[] = [];

    public close(reason?: string): void {
        this.closedWith.push(reason);
    }
}

/** A peer that records what it was sent and why it was closed, at the remote address given. */
const fakePeer = (connectionId: bigint, remote?: { address: string; port: number }) => {
    const sent: Buffer[] = [];
    const closed: (string | undefined)[] = [];
    const peer: NetherNetPeer = {
        id: connectionId,
        closed: false,
        send: (data) => {
            sent.push(Buffer.from(data));
            return data.byteLength;
        },
        close: (reason) => void closed.push(reason),
        provesKey: async (key) => key === 'proven-key',
        peer: { remoteAddress: () => remote }
    };
    return { peer, sent, closed };
};

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

            source.emit('openConnection', fakePeer(0xffff_ffff_ffffn, { address: '192.0.2.7', port: 50123 }).peer);
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
            // the server says the peer is open.
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

        it('holds no more than 64 KiB for a peer that has not opened', async () => {
            const source = new FakeNetherNetServer();
            const transport = new NetherNetTransport(source, new ConnectionIds());
            const frames: [Buffer, number][] = [];
            transport.onFrame((payload, id) => void frames.push([payload, id]));

            source.emit('encapsulated', Buffer.from('first'), 7n);
            source.emit('encapsulated', Buffer.alloc(64 * 1024), 7n);
            source.emit('openConnection', fakePeer(7n).peer);
            await settle();

            expect(frames).toStrictEqual([[batch('first'), 1]]);
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

        it('closes the NetherNet server on close', () => {
            const source = new FakeNetherNetServer();
            new NetherNetTransport(source, new ConnectionIds()).close();

            expect(source.closedWith).toStrictEqual(['Server closed']);
        });
    });

    describe('the selected pair', () => {
        it('finds nothing before ICE has chosen a pair', () => {
            expect(selectedCandidateAddress(fakePeer(1n).peer)).toBeUndefined();
        });
    });
});
