import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { BATCH_PACKET_ID } from '@jsprismarine/protocol';
import NetherNetTransport from './NetherNetTransport';

const closers: (() => void)[] = [];

/**
 * An HTTP server standing in for the signaling side of a game port.
 * @param join - Answers `GET /v1/join`: a status code and body.
 * @param offer - Answers `POST /v1/join/{networkId}`.
 */
const signalingServer = async (
    join: { status: number; body: string },
    offer: { status: number; body: string } = { status: 500, body: '13' }
) => {
    const server = http.createServer((request, response) => {
        const reply = request.method === 'GET' ? join : offer;
        request.resume();
        request.on('end', () => response.writeHead(reply.status).end(reply.body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => server.close());
    const bound = server.address();
    if (typeof bound !== 'object' || bound === null) throw new Error('not listening on TCP');
    return bound.port;
};

describe('NetherNetTransport', () => {
    afterEach(() => {
        for (const close of closers.splice(0)) close();
    });

    it('refuses a server that does not speak NetherNet on that port', async () => {
        const port = await signalingServer({ status: 404, body: 'Not Found' });

        await expect(new NetherNetTransport({ host: '127.0.0.1', port }).connect()).rejects.toThrow(
            `127.0.0.1:${port} does not speak NetherNet`
        );
    });

    it('fails the connection with what the server said when it refuses the offer', async () => {
        const port = await signalingServer({ status: 200, body: '' }, { status: 500, body: '13' });

        await expect(new NetherNetTransport({ host: '127.0.0.1', port, timeoutMs: 10_000 }).connect()).rejects.toThrow(
            'The server refused the offer with HTTP 500: 13'
        );
    });

    it('refuses an answer that carries no identity, as a game client does', async () => {
        // What Bedrock Dedicated Server's answer would look like with a=identity stripped.
        const port = await signalingServer({ status: 200, body: '' }, { status: 200, body: 'v=0\r\n' });

        await expect(new NetherNetTransport({ host: '127.0.0.1', port, timeoutMs: 10_000 }).connect()).rejects.toThrow(
            'carries no a=identity'
        );
    });

    it('reports itself encrypted, so the session leaves batches in the clear', () => {
        expect(new NetherNetTransport({ host: '127.0.0.1', port: 1 }).encrypted).toBe(true);
    });

    it('refuses to send before it is connected', () => {
        const transport = new NetherNetTransport({ host: '127.0.0.1', port: 1 });

        expect(() => transport.send(Buffer.from([BATCH_PACKET_ID, 0]))).toThrow('not connected');
        expect(transport.getStats()).toStrictEqual({
            rtt: null,
            bytesSent: 0,
            bytesReceived: 0,
            packetsSent: 0,
            packetsReceived: 0
        });
    });

    it('reports a close once, however many times it is closed', () => {
        const transport = new NetherNetTransport({ host: '127.0.0.1', port: 1 });
        const reasons: string[] = [];
        transport.on('close', (reason) => void reasons.push(reason));

        transport.close('done');
        transport.close('again');

        expect(reasons).toStrictEqual(['done']);
    });
});
