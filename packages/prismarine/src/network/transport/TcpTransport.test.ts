import { connect } from 'node:net';

import { framed } from '@jsprismarine/protocol/java/wire/frames';
import { afterEach, describe, expect, it } from 'vitest';

import { ConnectionIds } from './ConnectionId';
import { protocolOf, TcpTransport } from './TcpTransport';

const quiet = { debug: () => {} };

describe('protocolOf', () => {
    it('tells an HTTP request from the bytes a Java client opens with, and waits on a partial opening', () => {
        expect(protocolOf(Buffer.from('GET /resource-packs/x.zip HTTP/1.1\r\n'))).toBe('http');
        expect(protocolOf(Buffer.from('HEAD / HTTP/1.1\r\n'))).toBe('http');
        expect(protocolOf(Buffer.from('GE'))).toBe('undecided');
        expect(protocolOf(Buffer.from('HEAD'))).toBe('undecided');
        // A handshake of 71 bytes opens with 0x47, the G of GET, then packet id 0.
        expect(protocolOf(Buffer.from([0x47, 0x00, 0x45, 0x54, 0x20, 0x2f]))).toBe('java');
        expect(protocolOf(Buffer.from([0xfe, 0x01]))).toBe('java');
        expect(protocolOf(Buffer.from('POST / HTTP/1.1\r\n'))).toBe('java');
    });
});

describe('TcpTransport', () => {
    let transport: TcpTransport | undefined;
    afterEach(() => transport?.close());

    it('answers HTTP and reads Java frames on the one port', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet, (request, response) =>
            response.writeHead(200, { 'Content-Type': 'text/plain' }).end(`you asked for ${request.url}`)
        );
        const frames: string[] = [];
        transport.onFrame((frame) => void frames.push(frame.toString()));
        await transport.listen('127.0.0.1', 0);
        const port = transport.port()!;

        const response = await fetch(`http://127.0.0.1:${port}/resource-packs/abc.zip`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('you asked for /resource-packs/abc.zip');

        const socket = connect(port, '127.0.0.1');
        await new Promise<void>((resolve) => socket.once('connect', resolve));
        socket.write(Buffer.concat([framed(Buffer.from('first')), framed(Buffer.from('second'))]));
        await expect.poll(() => frames).toEqual(['first', 'second']);
        socket.destroy();
    });

    it('waits for an HTTP opening split across packets before it routes the connection', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet, (request, response) =>
            response.writeHead(200).end(`${request.method} ${request.url}`)
        );
        await transport.listen('127.0.0.1', 0);

        for (const [method, first, rest] of [
            ['GET', 'GE', 'T /split HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'],
            ['HEAD', 'HEAD', ' /split HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n']
        ] as const) {
            const socket = connect(transport.port()!, '127.0.0.1');
            await new Promise<void>((resolve) => socket.once('connect', resolve));
            const answer = new Promise<string>((resolve) => {
                let text = '';
                socket.on('data', (chunk: Buffer) => (text += chunk.toString()));
                socket.on('end', () => resolve(text));
            });
            socket.write(first);
            await new Promise((resolve) => setImmediate(resolve));
            socket.end(rest);
            expect(await answer).toMatch(/^HTTP\/1\.1 200 /);
            if (method === 'GET') expect(await answer).toContain('GET /split');
        }
    });

    it('reads every connection as a Java client without an HTTP handler', async () => {
        transport = new TcpTransport(new ConnectionIds(), quiet);
        const frames: string[] = [];
        transport.onFrame((frame) => void frames.push(frame.toString()));
        await transport.listen('127.0.0.1', 0);

        const socket = connect(transport.port()!, '127.0.0.1');
        await new Promise<void>((resolve) => socket.once('connect', resolve));
        socket.write(framed(Buffer.from('GET /')));
        await expect.poll(() => frames).toEqual(['GET /']);
        socket.destroy();
    });
});
