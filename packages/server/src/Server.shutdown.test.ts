import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface ChildExit {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
}

const INSPECTOR_LINE = 'JSPrismarine inspector target: ';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const waitForResponse = (socket: WebSocket, id: number): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
        const removeListeners = (): void => {
            socket.removeEventListener('message', onMessage);
            socket.removeEventListener('close', onClose);
            socket.removeEventListener('error', onError);
        };
        const onMessage = (event: MessageEvent): void => {
            const message: unknown = JSON.parse(String(event.data));
            if (!isRecord(message) || message.id !== id) return;
            removeListeners();
            resolve(message);
        };
        const onClose = (): void => {
            removeListeners();
            reject(new Error('inspector disconnected before responding'));
        };
        const onError = (): void => {
            removeListeners();
            reject(new Error('inspector connection failed before responding'));
        };
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onClose);
        socket.addEventListener('error', onError);
    });

const waitForServerRunning = (child: ChildProcess): Promise<void> =>
    new Promise((resolve, reject) => {
        const removeListeners = (): void => {
            child.off('message', onMessage);
            child.off('exit', onExit);
            child.off('error', onError);
        };
        const onMessage = (message: unknown): void => {
            if (!isRecord(message) || message.type !== 'lifecycle' || message.state !== 'running') return;
            removeListeners();
            resolve();
        };
        const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
            removeListeners();
            reject(new Error(`server exited before running (${code ?? signal})`));
        };
        const onError = (error: Error): void => {
            removeListeners();
            reject(error);
        };
        child.on('message', onMessage);
        child.on('exit', onExit);
        child.on('error', onError);
    });

const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<ChildExit> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            child.off('exit', onExit);
            reject(new Error(`server did not exit within ${timeoutMs} ms`));
        }, timeoutMs);
        const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
            clearTimeout(timer);
            resolve({ code, signal });
        };
        child.once('exit', onExit);
    });

describe('server shutdown', () => {
    it('disconnects DevTools before completing graceful shutdown', async () => {
        const dataDirectory = await mkdtemp(path.join(tmpdir(), 'jsprismarine-server-shutdown-'));
        await writeFile(
            path.join(dataDirectory, 'config.json'),
            JSON.stringify({
                'level-name': 'world',
                'enable-query': false,
                'enable-ticking': false,
                'enable-process-title': false,
                'preload-radius': 0,
                port: 0,
                worlds: { world: { generator: 'Flat', provider: 'LevelDB', seed: '20261028' } }
            })
        );

        const child = spawn(
            process.execPath,
            [
                '--import',
                import.meta.resolve('tsx'),
                fileURLToPath(new URL('./Server.ts', import.meta.url)),
                '--devtools',
                '--headless',
                '--role',
                'server'
            ],
            {
                cwd: process.cwd(),
                env: { ...process.env, NODE_ENV: 'development', NODE_OPTIONS: '', JSP_DIR: dataDirectory },
                stdio: ['ignore', 'ignore', 'pipe', 'ipc']
            }
        );
        const serverRunning = waitForServerRunning(child);
        const stderr = child.stderr;
        if (stderr === null) throw new Error('server stderr was not piped');
        const lines = createInterface({ input: stderr });
        const output: string[] = [];
        lines.on('line', (line) => output.push(line));

        const inspectorUrl = new Promise<string>((resolve, reject) => {
            lines.on('line', (line) => {
                if (line.startsWith(INSPECTOR_LINE)) resolve(line.slice(INSPECTOR_LINE.length));
            });
            child.once('error', reject);
            child.once('exit', (code, signal) =>
                reject(new Error(`server exited before opening DevTools (${code ?? signal})`))
            );
        });

        let socket: WebSocket | undefined;
        try {
            const [endpointUrl] = await Promise.all([inspectorUrl, serverRunning]);
            socket = new WebSocket(endpointUrl);
            await once(socket, 'open');

            const response = waitForResponse(socket, 1);
            socket.send(JSON.stringify({ id: 1, method: 'Runtime.enable', params: {} }));
            const message = await response;
            expect(message.id).toBe(1);
            expect(message.error).toBeUndefined();

            const exit = waitForExit(child, 5000);
            child.send({ type: 'shutdown', v: 1 });
            const exitResult = await exit;

            expect(exitResult).toEqual({ code: 0, signal: null });
            expect(output.join('\n')).toContain('JSPrismarine trace saved to ');
        } finally {
            socket?.close();
            lines.close();
            if (child.exitCode === null && child.signalCode === null) {
                const exited = once(child, 'exit');
                child.kill('SIGKILL');
                await exited;
            }
            await rm(dataDirectory, { recursive: true, force: true });
        }
    });
});
