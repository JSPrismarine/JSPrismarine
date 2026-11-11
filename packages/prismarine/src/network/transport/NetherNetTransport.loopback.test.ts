import dgram from 'node:dgram';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import { LanDiscovery, loadNativeDriver, NetherNetClient, NetherNetServer } from '@jsprismarine/nethernet';
import type { SignalStructure } from '@jsprismarine/nethernet';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { ConnectionIds } from './ConnectionId';
import NetherNetTransport from './NetherNetTransport';
import type { NetherNetTransportConnection } from './NetherNetTransport';

/** The native WebRTC stack, or undefined on a machine with no build of it. */
const driver = await loadNativeDriver().catch(() => undefined);

describe.skipIf(driver === undefined)('network/transport/NetherNetTransport over a real WebRTC connection', () => {
    it('carries batches both ways between a client that found the server on the LAN and the server', async () => {
        // A free port stands in for UDP 7551, which another server or game on this host may hold.
        const probe = dgram.createSocket('udp4');
        probe.bind(0, '127.0.0.1');
        await once(probe, 'listening');
        const lanPort = probe.address().port;
        probe.close();

        const nethernet = new NetherNetServer({ driver: driver!, host: '127.0.0.1', lanPort });
        nethernet.setAdvertisement(Buffer.from([0]));
        await nethernet.listen();
        const transport = new NetherNetTransport(nethernet, new ConnectionIds());
        const discovery = new LanDiscovery({ broadcastAddress: '127.0.0.1', port: lanPort });
        const found = once(discovery, 'server');
        await discovery.start();
        await found;
        const client = new NetherNetClient({
            driver: driver!,
            networkId: discovery.networkId,
            serverNetworkId: nethernet.networkId,
            signal: (signal) => discovery.sendSignal(signal)
        });
        discovery.on('signal', (signal: SignalStructure) => client.handleSignal(signal));
        try {
            const connected = new Promise<NetherNetTransportConnection>((resolve) => transport.onConnect(resolve));
            const serverFrame = new Promise<Buffer>((resolve) => transport.onFrame((payload) => resolve(payload)));
            const clientMessage = new Promise<Buffer>((resolve) => client.on('encapsulated', resolve));
            const disconnected = new Promise<number>((resolve) => transport.onDisconnect((id) => resolve(id)));
            const clientConnected = once(client, 'connected');

            await client.connect();
            const connection = await connected;
            expect(connection.id).toBe(1);
            // Whichever of this host's interfaces ICE chose, not the placeholder for an unknown peer.
            expect(connection.address.toString()).not.toBe('0.0.0.0:0');
            expect(connection.address.getPort()).toBeGreaterThan(0);

            await clientConnected;
            client.send(Buffer.from('to the server'));
            expect((await serverFrame).toString('latin1')).toBe(`${String.fromCharCode(BATCH_PACKET_ID)}to the server`);

            connection.sendFrame(Buffer.concat([Buffer.from([BATCH_PACKET_ID]), Buffer.from('to the client')]));
            expect((await clientMessage).toString()).toBe('to the client');

            await connection.close('done');
            expect(await disconnected).toBe(1);
        } finally {
            client.close();
            discovery.close();
            transport.close();
        }
    });
});
