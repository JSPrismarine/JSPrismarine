import { Client, Server } from 'nethernet';
import { describe, expect, it } from 'vitest';

import { adaptPeerConnections } from '@jsprismarine/nethernet';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { ConnectionIds } from './ConnectionId';
import NetherNetTransport from './NetherNetTransport';
import type { NetherNetTransportConnection } from './NetherNetTransport';

const isAddressInUse = (error: unknown): boolean =>
    error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';

describe('network/transport/NetherNetTransport over a real WebRTC connection', () => {
    it('carries batches both ways between a nethernet client and the server', async (context) => {
        const nethernet = new Server({ host: '127.0.0.1' });
        adaptPeerConnections(nethernet);
        // The client finds the server through discovery, which needs some advertisement to answer with.
        nethernet.setAdvertisement(Buffer.from([0]));
        try {
            await nethernet.listen();
        } catch (error: unknown) {
            nethernet.close();
            // UDP 7551 is fixed by the protocol; another server or game on this host may hold it.
            if (isAddressInUse(error)) context.skip('UDP port 7551 is in use on this host');
            throw error;
        }

        const transport = new NetherNetTransport(nethernet, new ConnectionIds());
        const client = new Client(nethernet.networkId, '127.0.0.1');
        adaptPeerConnections(client);
        try {
            const connected = new Promise<NetherNetTransportConnection>((resolve) => transport.onConnect(resolve));
            const serverFrame = new Promise<Buffer>((resolve) => transport.onFrame((payload) => resolve(payload)));
            const clientMessage = new Promise<Buffer>((resolve) =>
                client.on('encapsulated', (data) => resolve(Buffer.from(data)))
            );
            const disconnected = new Promise<number>((resolve) => transport.onDisconnect((id) => resolve(id)));

            client.connect();
            const connection = await connected;
            expect(connection.id).toBe(1);
            // Whichever of this host's interfaces ICE chose, not the placeholder for an unknown peer.
            expect(connection.address.toString()).not.toBe('0.0.0.0:0');
            expect(connection.address.getPort()).toBeGreaterThan(0);

            client.send(Buffer.from('to the server'));
            expect((await serverFrame).toString('latin1')).toBe(`${String.fromCharCode(BATCH_PACKET_ID)}to the server`);

            connection.sendFrame(Buffer.concat([Buffer.from([BATCH_PACKET_ID]), Buffer.from('to the client')]));
            expect((await clientMessage).toString()).toBe('to the client');

            connection.close('done');
            expect(await disconnected).toBe(1);
        } finally {
            client.close();
            transport.close();
        }
    });
});
