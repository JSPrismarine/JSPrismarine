/**
 * The socket thread of {@link DebuggerThread}: it listens or connects with the transport, joins
 * each connection to a {@link DebuggerChannelBridge}, and sends the bridge's endpoint to the thread
 * that started it. It wakes that thread's event loop after each message the extension sends.
 */
import { parentPort } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { DebuggerChannelBridge } from './channel';
import type { DebuggerThreadMessage, DebuggerThreadRequest } from './thread';
import { connectToDebugger, listenForDebugger } from './transport';
import type { DebuggerListener, DebuggerSocket } from './transport';

const port = parentPort;
if (port === null) throw new ScriptHostErrors.ConnectionWorkerOnMainThread();

const post = (message: DebuggerThreadMessage, transfer: MessagePort[] = []): void =>
    port.postMessage(message, transfer);

let listener: DebuggerListener | undefined;
let connection: { readonly socket: DebuggerSocket; readonly bridge: DebuggerChannelBridge } | undefined;

/**
 * Closes the listener and the connection, whichever are open. A connection whose session has
 * already closed its end is left to the bridge, which closes the socket once it has passed on what
 * the session sent last, such as the thread's exit.
 */
const closeAll = (): void => {
    listener?.close();
    listener = undefined;
    if (connection !== undefined && !connection.bridge.closed) {
        connection.bridge.close();
        connection.socket.close();
    }
    connection = undefined;
};

/** Joins a connection to a new bridge, and hands the bridge's endpoint to the other thread. */
const adopt = (socket: DebuggerSocket): void => {
    const { address, port: peerPort } = socket.peer;
    const bridge = new DebuggerChannelBridge();
    bridge.connect(socket);
    socket.onMessage(() => post({ kind: 'activity' }));
    socket.onClose(() => {
        if (connection?.socket === socket) connection = undefined;
        post({ kind: 'activity' });
    });
    connection = { socket, bridge };
    post({ kind: 'connected', connection: { endpoint: bridge.endpoint, address, port: peerPort } }, [
        bridge.endpoint.port
    ]);
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const handle = async (request: DebuggerThreadRequest): Promise<void> => {
    try {
        switch (request.op) {
            case 'listen': {
                closeAll();
                const opened = await listenForDebugger(request.options);
                listener = opened;
                opened.connection.then(
                    (socket) => {
                        if (listener === opened) listener = undefined;
                        adopt(socket);
                    },
                    () => undefined
                );
                post({ kind: 'reply', id: request.id, port: opened.address.port });
                return;
            }
            case 'connect': {
                closeAll();
                adopt(await connectToDebugger(request.options));
                post({ kind: 'reply', id: request.id });
                return;
            }
            case 'close':
                closeAll();
                post({ kind: 'reply', id: request.id });
                return;
        }
    } catch (error) {
        post({ kind: 'reply', id: request.id, error: errorText(error) });
    }
};

port.on('message', (request: DebuggerThreadRequest) => void handle(request));
