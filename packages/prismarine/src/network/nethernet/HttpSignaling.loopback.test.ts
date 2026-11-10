import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import { Client, Server, SignalStructure, SignalType } from 'nethernet';
import { stub } from '../../testing/stub.test.helper';
import { ConnectionIds } from '../transport/ConnectionId';
import NetherNetTransport from '../transport/NetherNetTransport';
import type { NetherNetTransportConnection } from '../transport/NetherNetTransport';
import { BEDROCK_CURVE, HttpSignaling, NetherNetIdentity } from '@jsprismarine/nethernet';

describe('network/nethernet/HttpSignaling over a real WebRTC connection', () => {
    it('lets a client join by address: offer over HTTP, then batches over the data channel', async () => {
        const nethernet = new Server();
        const transport = new NetherNetTransport(nethernet, new ConnectionIds());
        const { privateKey } = generateKeyPairSync('ec', { namedCurve: BEDROCK_CURVE });
        const signaling = new HttpSignaling({
            answerer: nethernet,
            status: () => '{}',
            sign: (answer) => new NetherNetIdentity(privateKey).sign(answer),
            logger: stub<Logger>({ debug: () => {}, error: () => {} })
        });
        const port = await signaling.listen(0, '127.0.0.1');

        // A client joining by address signals over HTTP instead of LAN discovery.
        const client = new Client(nethernet.networkId, '127.0.0.1');
        const answers: string[] = [];
        client.signalHandler = (signal) => {
            if (signal.type !== SignalType.ConnectRequest) return;
            void fetch(`http://127.0.0.1:${port}/v1/join/${client.networkId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: signal.data
            })
                .then((response) => response.text())
                .then((answer) => {
                    answers.push(answer);
                    client.handleSignal(
                        new SignalStructure(
                            SignalType.ConnectResponse,
                            client.connectionId,
                            answer,
                            nethernet.networkId
                        )
                    );
                });
        };

        try {
            const connected = new Promise<NetherNetTransportConnection>((resolve) => transport.onConnect(resolve));
            const serverFrame = new Promise<Buffer>((resolve) => transport.onFrame((payload) => resolve(payload)));
            const clientMessage = new Promise<Buffer>((resolve) =>
                client.on('encapsulated', (data) => resolve(Buffer.from(data)))
            );

            client.connect();
            const connection = await connected;

            expect(answers[0]).toMatch(/\r\na=identity:/);
            // Whichever of this host's interfaces ICE chose, not the placeholder for an unknown peer.
            expect(connection.address.toString()).not.toBe('0.0.0.0:0');
            expect(connection.address.getPort()).toBeGreaterThan(0);

            client.send(Buffer.from('hello'));
            expect((await serverFrame).subarray(1).toString()).toBe('hello');

            connection.sendFrame(Buffer.concat([Buffer.from([BATCH_PACKET_ID]), Buffer.from('welcome')]));
            expect((await clientMessage).toString()).toBe('welcome');
        } finally {
            client.close();
            transport.close();
            signaling.close();
        }
    });
});
