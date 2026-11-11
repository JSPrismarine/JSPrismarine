import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import type { Connection } from './Connection';
import { NetherNetClient } from './NetherNetClient';
import { NetherNetServer } from './NetherNetServer';
import { SignalType } from './protocol/Signal';
import { loadDriver, nativeAvailable } from './testing/nativeDriver.test.helper';
import type { PeerConfig } from './WebRtcDriver';

const LOOPBACK: PeerConfig = { bindAddress: '127.0.0.1' };
const MESSAGES = 200;
const MESSAGE_BYTES = 10_000;

describe.skipIf(!nativeAvailable())('closing a NetherNet connection', async () => {
    const driver = await loadDriver();

    /** Sends every message from the server and closes it at once, as a kick does, and counts what the client got. */
    const sendThenClose = async (): Promise<{ sent: number; received: number; buffered: number }> => {
        const server = new NetherNetServer({ driver, peerConfig: () => LOOPBACK });
        const opened = once(server, 'openConnection') as Promise<[Connection]>;
        const client: NetherNetClient = new NetherNetClient({
            driver,
            peerConfig: LOOPBACK,
            signal: (signal) => {
                if (signal.type === SignalType.ConnectRequest)
                    void server.handleOffer(signal, (reply) => client.handleSignal(reply));
            }
        });
        let received = 0;
        client.on('encapsulated', (message: Buffer) => {
            received += message.byteLength;
        });
        const disconnected = once(client, 'disconnect');
        await client.connect();
        const [connection] = await opened;
        const payload = Buffer.alloc(MESSAGE_BYTES, 1);

        for (let index = 0; index < MESSAGES; index++) connection.send(payload);
        const buffered = connection.reliable?.bufferedAmount ?? 0;
        // No drain: the channels, then the peer connection, at once.
        connection.close('Kicked');
        await disconnected;
        server.close();
        return { sent: MESSAGES * MESSAGE_BYTES, received, buffered };
    };

    it('delivers every byte sent before a close, with nothing waited for', async () => {
        const runs = [];
        for (let run = 0; run < 5; run++) runs.push(await sendThenClose());

        // Some runs close with data still queued in libdatachannel, which is what makes this a test.
        expect(runs.some((run) => run.buffered > 0)).toBe(true);
        for (const run of runs) expect(run.received).toBe(run.sent);
    }, 120_000);
});
