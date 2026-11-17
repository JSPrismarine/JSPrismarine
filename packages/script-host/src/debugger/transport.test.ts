import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { Worker } from 'node:worker_threads';
import { DebuggerFramingError, DebuggerTransportError } from '@jsprismarine/errors/script-host';
import { describe, expect, it } from 'vitest';

import { scriptHostAvailable } from '../testing/library.test.helper';
import type { DebuggerWorkerData, DebuggerWorkerReport } from '../testing/debuggerWorker';
import { DebuggerChannelBridge } from './channel';
import { FrameDecoder, MAX_RECEIVED_FRAME_LENGTH, encodeFrame } from './framing';
import { isRecord } from '../isRecord';
import { checkListenAddress, connectToDebugger, isLoopbackAddress, listenForDebugger } from './transport';

/** Node.js strips the worker's types; the repository's resolver adds its extensionless imports. */
const loader = new URL('../../../../scripts/native-typescript-loader.mjs', import.meta.url).href;

/**
 * Plays the extension on a real socket: it frames what it sends, and answers each message the
 * host sends with `react`, so the conversation runs on events and never on a timer.
 */
const extensionOn = (
    socket: Socket,
    react: (message: Record<string, unknown>, send: (message: unknown) => void) => void
) => {
    const decoder = new FrameDecoder();
    const received: Record<string, unknown>[] = [];
    const send = (message: unknown): void => {
        socket.write(encodeFrame(message));
    };
    socket.on('data', (chunk: Buffer) => {
        for (const message of decoder.push(chunk)) {
            if (!isRecord(message)) continue;
            received.push(message);
            react(message, send);
        }
    });
    return received;
};

const eventOf = (message: Record<string, unknown>): Record<string, unknown> | undefined =>
    message.type === 'event' && isRecord(message.event) ? message.event : undefined;

describe('the debugger transport', () => {
    it('treats only loopback addresses as local', () => {
        expect(
            ['127.0.0.1', '127.8.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].map(isLoopbackAddress)
        ).toEqual([true, true, true, true, true, true]);
        expect(['0.0.0.0', '192.168.1.4', '::', 'example.com'].map(isLoopbackAddress)).toEqual([
            false,
            false,
            false,
            false
        ]);
    });

    it('refuses to listen on a non-loopback address without a passcode, with BDS’s message', async () => {
        expect(() => checkListenAddress('0.0.0.0', undefined)).toThrow(
            'Refusing to start script debugger listener on non-loopback address [0.0.0.0] without a passcode.'
        );
        expect(() => checkListenAddress('0.0.0.0', '')).toThrow(DebuggerTransportError);
        expect(() => checkListenAddress('0.0.0.0', 'secret')).not.toThrow();
        await expect(listenForDebugger({ address: '0.0.0.0', port: 0 })).rejects.toThrow(DebuggerTransportError);
    });

    it('connects to an extension that listens, and frames both directions', async () => {
        const server = createServer();
        const fromHost = new Promise<unknown[]>((resolve) => {
            server.on('connection', (socket) => {
                const received = extensionOn(socket, (_message, send) => {
                    send({ type: 'resume' });
                    resolve(received);
                });
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') throw new Error('no address');

        const socket = await connectToDebugger({ host: '127.0.0.1', port: address.port });
        const fromExtension = new Promise<unknown>((resolve) => socket.onMessage(resolve));
        socket.send({ type: 'event', event: { type: 'PrintEvent', message: 'hi', logLevel: 1 } });

        expect(await fromHost).toEqual([{ type: 'event', event: { type: 'PrintEvent', message: 'hi', logLevel: 1 } }]);
        expect(await fromExtension).toEqual({ type: 'resume' });
        socket.close();
        server.close();
    });

    it('closes fully once its last message is sent, though the peer keeps its side open', async () => {
        const server = createServer({ allowHalfOpen: true });
        const peer = new Promise<{ socket: Socket; received: unknown[]; ended: Promise<void> }>((resolve) => {
            server.on('connection', (socket) => {
                const decoder = new FrameDecoder();
                const received: unknown[] = [];
                socket.on('data', (chunk: Buffer) => received.push(...decoder.push(chunk)));
                const ended = new Promise<void>((done) => socket.once('end', () => done()));
                resolve({ socket, received, ended });
            });
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string') throw new Error('no address');

        const socket = await connectToDebugger({ host: '127.0.0.1', port: address.port });
        const closed = new Promise<Error | undefined>((resolve) => socket.onClose(resolve));
        socket.send({ type: 'event', event: { type: 'ThreadEvent', reason: 'exited', thread: 1 } });
        socket.close();

        expect(await closed).toBeUndefined();
        const { socket: peerSocket, received, ended } = await peer;
        await ended;
        expect(received).toEqual([{ type: 'event', event: { type: 'ThreadEvent', reason: 'exited', thread: 1 } }]);
        peerSocket.destroy();
        server.close();
    });

    it('closes a connection whose frame header states a body over the limit', async () => {
        const listener = await listenForDebugger({ port: 0 });
        const peer = createConnection({ host: '127.0.0.1', port: listener.address.port });
        const peerClosed = new Promise<void>((resolve) => peer.once('close', () => resolve()));
        peer.on('error', () => undefined);
        const socket = await listener.connection;
        const closed = new Promise<Error | undefined>((resolve) => socket.onClose(resolve));

        peer.write(`${(MAX_RECEIVED_FRAME_LENGTH + 1).toString(16).padStart(8, '0')}\n`);

        expect(await closed).toBeInstanceOf(DebuggerFramingError);
        await peerClosed;
        expect(socket.closed).toBe(true);
        listener.close();
    });

    it.skipIf(!scriptHostAvailable())(
        'debugs a script on a worker thread from an extension connected over TCP',
        async () => {
            const listener = await listenForDebugger({ port: 0 });
            const bridge = new DebuggerChannelBridge();
            void listener.connection.then((socket) => bridge.connect(socket));

            const workerData: DebuggerWorkerData = {
                endpoint: bridge.endpoint,
                plugins: [{ name: 'Pack', module_uuid: '4f2b6b3a-0000-4000-8000-000000000001' }],
                file: 'main.js',
                source: 'function twice(n) {\n    const doubled = n * 2;\n    return doubled;\n}\ntwice(21);'
            };
            const worker = new Worker(new URL('../testing/debuggerWorker.ts', import.meta.url), {
                workerData,
                transferList: [bridge.endpoint.port],
                execArgv: ['--import', loader]
            });
            const report = new Promise<DebuggerWorkerReport>((resolve, reject) => {
                worker.once('message', resolve);
                worker.once('error', reject);
            });

            const socket = createConnection({ host: '127.0.0.1', port: listener.address.port });
            let stackTrace: unknown;
            let exited: () => void = () => undefined;
            const threadExited = new Promise<void>((resolve) => {
                exited = resolve;
            });
            const received = extensionOn(socket, (message, send) => {
                const event = eventOf(message);
                if (event?.type === 'ThreadEvent' && event.reason === 'exited') exited();
                if (event?.type === 'ProtocolEvent') {
                    send({
                        type: 'protocol',
                        version: event.version,
                        target_module_uuid: '4f2b6b3a-0000-4000-8000-000000000001'
                    });
                } else if (event?.type === 'ThreadEvent' && event.reason === 'new') {
                    send({
                        type: 'request',
                        request: {
                            request_seq: 1,
                            command: 'setBreakpoints',
                            args: { path: 'main.js', breakpoints: [3] }
                        }
                    });
                    send({ type: 'resume' });
                } else if (event?.type === 'StoppedEvent') {
                    send({
                        type: 'request',
                        request: { request_seq: 2, command: 'stackTrace', args: { threadId: event.thread } }
                    });
                } else if (message.type === 'response' && message.request_seq === 2) {
                    stackTrace = message.body;
                    send({ type: 'request', request: { request_seq: 3, command: 'continue', args: {} } });
                }
            });

            expect(await report).toEqual({ target: '4f2b6b3a-0000-4000-8000-000000000001', result: 42 });
            // The worker reports before its last messages have crossed the socket.
            await threadExited;
            expect(stackTrace).toEqual([
                { id: 0, name: 'twice', filename: 'main.js', line: 3, column: 12 },
                { id: 1, name: '<eval>', filename: 'main.js', line: 5, column: 6 }
            ]);
            expect(received.map((message) => eventOf(message)?.type ?? message.type)).toEqual([
                'ProtocolEvent',
                'ThreadEvent',
                'response',
                'StoppedEvent',
                'response',
                'response',
                'ThreadEvent'
            ]);
            socket.destroy();
            listener.close();
            await worker.terminate();
        }
    );
});
