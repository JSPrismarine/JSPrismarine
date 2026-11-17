/**
 * Plays Mojang's VS Code debugger extension on a worker thread, over a real TCP socket. It has to
 * run on a thread of its own: a script stopped at a breakpoint blocks the world's thread, and the
 * extension answers the stop while it is blocked.
 *
 * It answers the protocol event as the extension does, then sends what VS Code sends after the
 * extension's InitializedEvent: the breakpoints, the exception setting and `resume`. At a stop it
 * asks for the stack trace and continues once the trace arrives. It reports every message it
 * receives, and its socket's events, to the thread that started it, and nothing in it reads a
 * clock.
 */
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { parentPort, workerData } from 'node:worker_threads';

import { FrameDecoder, encodeFrame } from '@jsprismarine/script-host/debugger/framing';

import { isRecord } from '../utils/isRecord';

/** How the extension behaves, from the test. */
export interface DebuggerExtensionScript {
    /** `connect` dials `port`, as the extension's connect mode does; `listen` waits on a port of its own. */
    readonly mode: 'connect' | 'listen';
    readonly port?: number;
    /** The `target_module_uuid` it answers with. */
    readonly target: string;
    /** The passcode it answers with, when the protocol event asks for one. */
    readonly passcode?: string;
    /** The breakpoints it sets after the handshake, by the path the extension knows the file by. */
    readonly breakpoints?: { readonly path: string; readonly lines: readonly number[] };
}

/** What the extension reports. */
export type DebuggerExtensionReport =
    | { readonly kind: 'listening'; readonly port: number }
    | { readonly kind: 'connected' }
    | { readonly kind: 'received'; readonly message: Record<string, unknown> }
    | { readonly kind: 'closed' };

/** A command from the test. */
export type DebuggerExtensionCommand = { readonly op: 'hang-up' };

const port = parentPort;
if (port === null) throw new Error('The fake debugger extension runs on a worker thread');
const report = (message: DebuggerExtensionReport): void => port.postMessage(message);

// Structured clone hands the worker plain data; DebuggerExtensionScript is what the test posts.
const script = workerData as DebuggerExtensionScript;

const converse = (socket: Socket): void => {
    report({ kind: 'connected' });
    const decoder = new FrameDecoder();
    let seq = 1;
    let traceSeq = -1;
    const send = (message: unknown): void => void socket.write(encodeFrame(message));
    const request = (command: string, args: Record<string, unknown>): number => {
        const request_seq = seq++;
        send({ type: 'request', request: { request_seq, command, args } });
        return request_seq;
    };
    socket.on('data', (chunk: Buffer) => {
        for (const message of decoder.push(chunk)) {
            if (!isRecord(message)) continue;
            report({ kind: 'received', message });
            const event = message.type === 'event' && isRecord(message.event) ? message.event : undefined;
            if (event?.type === 'ProtocolEvent') {
                send({
                    type: 'protocol',
                    version: event.version,
                    target_module_uuid: script.target,
                    ...(event.require_passcode === true ? { passcode: script.passcode ?? '' } : {})
                });
                if (script.breakpoints !== undefined) {
                    request('setBreakpoints', {
                        path: script.breakpoints.path,
                        breakpoints: script.breakpoints.lines
                    });
                }
                send({ type: 'stopOnException', stopOnException: false });
                send({ type: 'resume' });
            } else if (event?.type === 'StoppedEvent') {
                traceSeq = request('stackTrace', { threadId: event.thread });
            } else if (message.type === 'response' && message.request_seq === traceSeq) {
                request('continue', {});
            }
        }
    });
    socket.on('close', () => report({ kind: 'closed' }));
    port.on('message', (command: DebuggerExtensionCommand) => {
        if (command.op === 'hang-up') socket.destroy();
    });
};

if (script.mode === 'connect') {
    const socket = createConnection({ host: '127.0.0.1', port: script.port ?? 0 });
    socket.once('connect', () => converse(socket));
} else {
    const server = createServer((socket) => {
        server.close();
        converse(socket);
    });
    server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (isRecord(address) && typeof address.port === 'number') report({ kind: 'listening', port: address.port });
    });
}
