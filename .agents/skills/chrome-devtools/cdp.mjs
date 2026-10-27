#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const HELP = `Usage:
  node .agents/skills/chrome-devtools/cdp.mjs connect --url <inspector-ws-url>
  node .agents/skills/chrome-devtools/cdp.mjs call --url <inspector-ws-url> <method> [params-json] [--output <file>]

Set JSPRISMARINE_INSPECTOR_URL to omit --url.

connect reads one CDP request per stdin line and writes responses and events as JSON lines.
call sends one request and exits after its response. Use connect for debugger sessions.
Use saveTo in connect requests, or --output with call, to save command results and profiles.
The call timeout defaults to 30 seconds; --timeout-ms 0 waits without a timeout.
`;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const writeJson = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

const parseArguments = () => {
    const [mode, ...args] = process.argv.slice(2);
    if (!mode || mode === '--help' || mode === '-h' || mode === 'help') return { help: true };
    if (mode !== 'connect' && mode !== 'call') throw new Error(`Unknown command: ${mode}\n\n${HELP}`);

    let endpoint = process.env.JSPRISMARINE_INSPECTOR_URL;
    let timeoutMs = 30_000;
    let outputPath;
    const positional = [];
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument === '--url') {
            endpoint = args[++index];
            if (!endpoint) throw new Error('--url requires a WebSocket URL');
        } else if (argument === '--timeout-ms') {
            const value = args[++index];
            if (value === undefined || !/^\d+$/.test(value)) {
                throw new Error('--timeout-ms requires a non-negative integer');
            }
            timeoutMs = Number(value);
        } else if (argument === '--output') {
            outputPath = args[++index];
            if (!outputPath) throw new Error('--output requires a file path');
        } else if (argument === '--help' || argument === '-h') {
            return { help: true };
        } else {
            positional.push(argument);
        }
    }

    if (!endpoint) {
        throw new Error(
            `Missing inspector URL. Pass --url or set JSPRISMARINE_INSPECTOR_URL.\n\n${HELP}`
        );
    }
    const url = new URL(endpoint);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        throw new Error(`Inspector URL must use ws: or wss:, received ${url.protocol}`);
    }

    if (mode === 'connect' && positional.length > 0) {
        throw new Error(`connect takes no positional arguments.\n\n${HELP}`);
    }
    if (mode === 'connect' && outputPath) {
        throw new Error(`--output is only available with call.\n\n${HELP}`);
    }
    if (mode === 'call' && (positional.length < 1 || positional.length > 2)) {
        throw new Error(`call needs a CDP method and optional params JSON.\n\n${HELP}`);
    }

    if (typeof WebSocket === 'undefined') {
        throw new Error('This CLI requires Node with the built-in WebSocket API');
    }

    let method;
    let params = {};
    if (mode === 'call') {
        [method] = positional;
        if (positional[1] !== undefined) {
            try {
                params = JSON.parse(positional[1]);
            } catch (error) {
                throw new Error(`params-json is invalid JSON: ${error.message}`);
            }
        }
        if (typeof method !== 'string' || !method.includes('.')) {
            throw new Error(`Invalid CDP method: ${method}`);
        }
        if (!isRecord(params)) throw new Error('params-json must be a JSON object');
    }

    return { mode, endpoint, method, params, timeoutMs, outputPath };
};

const waitForOpen = (socket) =>
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

const messageText = async (data) => {
    if (typeof data === 'string') return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
    if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
    }
    if (data instanceof Blob) return data.text();
    throw new Error('Inspector sent an unsupported WebSocket message');
};

const saveArtifact = async (outputPath, method, response, snapshotChunks = []) => {
    const result = isRecord(response.result) ? response.result : {};
    const artifact =
        method === 'HeapProfiler.takeHeapSnapshot'
            ? snapshotChunks.join('')
            : method === 'Profiler.stop' && 'profile' in result
              ? result.profile
              : (response.result ?? response);
    const content = typeof artifact === 'string' ? artifact : `${JSON.stringify(artifact, null, 2)}\n`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content);
    console.error(`cdp: wrote ${outputPath}`);
};

const connect = async (endpoint) => {
    const socket = new WebSocket(endpoint);
    await waitForOpen(socket);
    console.error('cdp: connected; send one CDP request as JSON per stdin line');

    const pending = new Map();
    const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
    let nextId = 1;
    let inputEnded = false;
    let closingForInput = false;

    const closeIfIdle = () => {
        if (inputEnded && pending.size === 0 && socket.readyState === WebSocket.OPEN) {
            closingForInput = true;
            socket.close(1000, 'stdin ended');
        }
    };

    input.on('line', (line) => {
        if (!line.trim()) return;
        let command;
        try {
            command = JSON.parse(line);
        } catch (error) {
            console.error(`cdp: invalid JSON request: ${error.message}`);
            process.exitCode = 1;
            return;
        }
        if (!isRecord(command) || typeof command.method !== 'string' || !command.method.includes('.')) {
            console.error('cdp: each request must be a JSON object with a CDP method');
            process.exitCode = 1;
            return;
        }
        if (command.params !== undefined && !isRecord(command.params)) {
            console.error('cdp: request params must be a JSON object');
            process.exitCode = 1;
            return;
        }
        if (command.saveTo !== undefined && typeof command.saveTo !== 'string') {
            console.error('cdp: request saveTo must be a file path string');
            process.exitCode = 1;
            return;
        }

        const id = nextId++;
        pending.set(id, {
            method: command.method,
            saveTo: command.saveTo,
            snapshotChunks: []
        });
        const cdpCommand = { ...command };
        delete cdpCommand.saveTo;
        socket.send(JSON.stringify({ ...cdpCommand, id }));
    });

    input.on('close', () => {
        inputEnded = true;
        closeIfIdle();
    });

    socket.addEventListener('message', (event) => {
        void (async () => {
            const value = JSON.parse(await messageText(event.data));
            if (
                isRecord(value) &&
                value.method === 'HeapProfiler.addHeapSnapshotChunk' &&
                isRecord(value.params) &&
                typeof value.params.chunk === 'string'
            ) {
                const snapshot = [...pending.values()].find(
                    (request) => request.method === 'HeapProfiler.takeHeapSnapshot' && request.saveTo
                );
                if (snapshot) snapshot.snapshotChunks.push(value.params.chunk);
                else writeJson(value);
                return;
            }

            const request = isRecord(value) && typeof value.id === 'number' ? pending.get(value.id) : undefined;
            if (request?.saveTo && isRecord(value) && !value.error) {
                await saveArtifact(request.saveTo, request.method, value, request.snapshotChunks);
            } else {
                writeJson(value);
            }
            if (isRecord(value) && typeof value.id === 'number') pending.delete(value.id);
            closeIfIdle();
        })().catch((error) => {
            console.error(`cdp: could not read inspector message: ${error.message}`);
            process.exitCode = 1;
            socket.close(1002, 'invalid inspector message');
        });
    });

    socket.addEventListener('close', ({ code, reason }) => {
        for (const [id, request] of pending) {
            console.error(`cdp: connection closed while waiting for ${request.method} (id ${id})`);
        }
        if (pending.size > 0 && !closingForInput) process.exitCode = 1;
        console.error(`cdp: disconnected (${code}: ${reason})`);
        input.close();
    });

    socket.addEventListener('error', () => {
        console.error('cdp: inspector WebSocket error');
    });
};

const call = async (endpoint, method, params, timeoutMs, outputPath) => {
    const socket = new WebSocket(endpoint);
    await waitForOpen(socket);

    await new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const snapshotChunks = [];
        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve();
        };
        if (timeoutMs !== 0) {
            timer = setTimeout(() => {
                socket.close(1000, 'request timed out');
                finish(new Error(`Timed out waiting for ${method} after ${timeoutMs} ms`));
            }, timeoutMs);
        }

        socket.addEventListener('message', (event) => {
            void messageText(event.data)
                .then((text) => {
                    const value = JSON.parse(text);
                    const isSnapshotChunk =
                        isRecord(value) &&
                        value.method === 'HeapProfiler.addHeapSnapshotChunk' &&
                        isRecord(value.params) &&
                        typeof value.params.chunk === 'string';
                    if (outputPath && method === 'HeapProfiler.takeHeapSnapshot' && isSnapshotChunk) {
                        snapshotChunks.push(value.params.chunk);
                    } else {
                        writeJson(value);
                    }
                    if (isRecord(value) && value.id === 1) {
                        if (value.error) process.exitCode = 1;
                        if (outputPath && !value.error) {
                            return saveArtifact(outputPath, method, value, snapshotChunks).then(() => {
                                socket.close(1000, 'request complete');
                                finish();
                            });
                        }
                        socket.close(1000, 'request complete');
                        finish();
                    }
                })
                .catch((error) => {
                    socket.close(1002, 'invalid inspector message');
                    finish(error);
                });
        });
        socket.addEventListener('close', ({ code, reason }) => {
            if (!settled) {
                finish(new Error(`Inspector WebSocket closed before ${method} replied (${code}: ${reason})`));
            }
        });
        socket.addEventListener('error', () => {
            if (!settled) finish(new Error(`Inspector WebSocket failed during ${method}`));
        });
        socket.send(JSON.stringify({ id: 1, method, params }));
    });
};

try {
    const options = parseArguments();
    if (options.help) {
        process.stdout.write(HELP);
    } else if (options.mode === 'connect') {
        await connect(options.endpoint);
    } else {
        await call(options.endpoint, options.method, options.params, options.timeoutMs, options.outputPath);
    }
} catch (error) {
    console.error(`cdp: ${error.message}`);
    process.exitCode = 1;
}
