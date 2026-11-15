/**
 * Chrome DevTools Protocol plumbing over Node's built-in WebSocket, shared by the skill's scripts.
 * `cdp.mjs` uses the socket helpers; `profile.mjs` uses {@link openSession}.
 */

/** Whether a value is a plain object rather than null or an array. */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Resolves once the socket opens, and rejects when it fails, closes or takes over 10 seconds. */
export const waitForOpen = (socket) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close(1000, 'connection timed out');
            finish(new Error('Timed out connecting to the inspector WebSocket'));
        }, 10_000);
        const cleanup = () => {
            clearTimeout(timer);
            socket.removeEventListener('open', onOpen);
            socket.removeEventListener('error', onError);
            socket.removeEventListener('close', onClose);
        };
        const finish = (error) => {
            cleanup();
            if (error) reject(error);
            else resolve();
        };
        const onOpen = () => finish();
        const onError = () => finish(new Error('Could not connect to the inspector WebSocket'));
        const onClose = ({ code, reason }) =>
            finish(new Error(`Inspector WebSocket closed before connecting (${code}: ${reason})`));

        socket.addEventListener('open', onOpen, { once: true });
        socket.addEventListener('error', onError, { once: true });
        socket.addEventListener('close', onClose, { once: true });
    });

/** The text of one WebSocket message, whichever binary form it arrived in. */
export const messageText = async (data) => {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    }
    if (data instanceof Blob) return data.text();
    throw new Error('Inspector sent an unsupported WebSocket message');
};

/**
 * Opens a request-and-response session on an inspector WebSocket.
 *
 * `send` resolves with a command's result and rejects with its protocol error. After
 * `NodeWorker.enable`, `workers` maps each attached worker thread's session ID to its title, and
 * `sendToWorker` sends a command into that thread's own inspector, which is how a worker's
 * profiler is driven. Every pending command rejects when the socket closes.
 *
 * @param {string} endpoint - The `ws:` or `wss:` inspector URL.
 */
export const openSession = async (endpoint) => {
    const socket = new WebSocket(endpoint);
    await waitForOpen(socket);

    let nextId = 1;
    const pending = new Map();
    const workerPending = new Map();
    const workers = new Map();
    const listeners = new Set();

    const settle = (table, message) => {
        const request = table.get(message.id);
        if (!request) return;
        table.delete(message.id);
        if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
        else request.resolve(message.result ?? {});
    };

    const dispatch = (message) => {
        if (!isRecord(message)) return;
        if (typeof message.id === 'number') {
            settle(pending, message);
            return;
        }
        if (message.method === 'NodeWorker.attachedToWorker') {
            const { sessionId, workerInfo } = message.params;
            workers.set(sessionId, workerInfo.title || workerInfo.url || sessionId);
        } else if (message.method === 'NodeWorker.detachedFromWorker') {
            const { sessionId } = message.params;
            workers.delete(sessionId);
            // A worker that went away answers nothing more, so what was asked of it fails now.
            for (const [id, request] of workerPending) {
                if (request.sessionId !== sessionId) continue;
                workerPending.delete(id);
                request.reject(new Error(`${request.method}: the worker session ${sessionId} detached`));
            }
        } else if (message.method === 'NodeWorker.receivedMessageFromWorker') {
            const inner = JSON.parse(message.params.message);
            if (typeof inner.id === 'number') settle(workerPending, inner);
        }
        for (const listener of listeners) listener(message);
    };

    socket.addEventListener('message', (event) => {
        void messageText(event.data)
            .then((text) => dispatch(JSON.parse(text)))
            .catch((error) => console.error(`cdp: could not read inspector message: ${error.message}`));
    });
    socket.addEventListener('close', ({ code, reason }) => {
        for (const table of [pending, workerPending]) {
            for (const request of table.values()) {
                request.reject(new Error(`Inspector closed during ${request.method} (${code}: ${reason})`));
            }
            table.clear();
        }
    });

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            // A closed socket drops what is sent without an error, and its close handler has
            // already rejected everything pending, so the request would never settle.
            if (socket.readyState !== WebSocket.OPEN) {
                reject(new Error(`${method}: the inspector WebSocket is closed`));
                return;
            }
            const id = nextId++;
            pending.set(id, { method, resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });

    const sendToWorker = (sessionId, method, params = {}) =>
        new Promise((resolve, reject) => {
            // The inspector accepts a message for a session that is gone and never answers it.
            if (!workers.has(sessionId)) {
                reject(new Error(`${method}: no worker session ${sessionId} is attached`));
                return;
            }
            const id = nextId++;
            workerPending.set(id, { method, sessionId, resolve, reject });
            send('NodeWorker.sendMessageToWorker', {
                sessionId,
                message: JSON.stringify({ id, method, params })
            }).catch((error) => {
                workerPending.delete(id);
                reject(error);
            });
        });

    /** Evaluates an expression in the server, awaits a returned promise, and returns its JSON value. */
    const evaluate = async (expression) => {
        const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) {
            const details = response.exceptionDetails;
            throw new Error(`evaluation threw: ${details.exception?.description ?? details.text}`);
        }
        return response.result?.value;
    };

    return {
        send,
        sendToWorker,
        evaluate,
        workers,
        onEvent: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        close: () => socket.close(1000, 'done')
    };
};
