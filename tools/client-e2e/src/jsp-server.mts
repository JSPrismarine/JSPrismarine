/**
 * Boots a disposable JSPrismarine server for an e2e run: scratch data directory, flat world,
 * `online-mode` off so the unauthenticated test client can join, plain line console on stdio.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { repoRoot } from './cinnabar.mts';

/** A running scratch server: its address, console, log stream, and shutdown. */
export interface JspServer {
    port: number;
    /** The scratch `JSP_DIR` holding config, worlds, and log files. */
    dir: string;
    /** Every console line the server has printed so far. */
    lines: string[];
    /** Sends one console command, such as `say hello` or `time set noon`. */
    command: (line: string) => void;
    /** Resolves with the first new line matching `pattern`, or rejects after `timeoutMs`. */
    waitForLine: (pattern: RegExp, timeoutMs?: number) => Promise<string>;
    /** Asks the server to stop and waits for the process to exit. */
    stop: () => Promise<void>;
}

/** Finds a UDP port the OS considers free right now. */
const freeUdpPort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        socket.once('error', reject);
        socket.bind(0, '127.0.0.1', () => {
            const { port } = socket.address();
            socket.close(() => resolve(port));
        });
    });

/**
 * Starts the server from this checkout's sources and waits until it listens.
 *
 * @param options.seconds - Startup budget before the boot is declared failed. Default 120.
 * @throws When the process exits or the readiness line does not appear in time.
 */
export const startServer = async (
    options: { port?: number; dir?: string; seconds?: number } = {}
): Promise<JspServer> => {
    const port = options.port ?? (await freeUdpPort());
    const dir = options.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-e2e-server-'));
    fs.mkdirSync(dir, { recursive: true });
    const config = {
        port: port,
        'online-mode': false,
        'level-name': 'e2e',
        worlds: { e2e: { seed: '1', preset: 'minecraft:flat' } },
        'preload-radius': 0,
        'max-players': 4,
        motd: 'JSPrismarine e2e'
    };
    fs.writeFileSync(path.join(dir, 'config.json'), `${JSON.stringify(config, null, 4)}\n`);

    const serverPackage = path.join(repoRoot, 'packages', 'server');
    const child: ChildProcess = spawn(
        process.execPath,
        ['--import', 'tsx', path.join(serverPackage, 'src', 'Server.ts'), '--no-tui', '--port', String(port)],
        {
            cwd: serverPackage,
            env: { ...process.env, JSP_DIR: dir, NODE_ENV: 'production' },
            stdio: ['pipe', 'pipe', 'pipe']
        }
    );

    const lines: string[] = [];
    const lineWaiters: { pattern: RegExp; resolve: (line: string) => void }[] = [];
    let buffered = '';
    const onOutput = (chunk: Buffer): void => {
        buffered += chunk.toString();
        for (;;) {
            const newline = buffered.indexOf('\n');
            if (newline === -1) break;
            // The line console colors its output; strip ANSI escapes so patterns match plainly.
            // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes start with ESC.
            const line = buffered.slice(0, newline).replace(/\u001b\[[0-9;]*m/g, '');
            buffered = buffered.slice(newline + 1);
            lines.push(line);
            for (let index = lineWaiters.length - 1; index >= 0; index -= 1) {
                const waiter = lineWaiters[index]!;
                if (waiter.pattern.test(line)) {
                    lineWaiters.splice(index, 1);
                    waiter.resolve(line);
                }
            }
        }
    };
    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

    const waitForLine = (pattern: RegExp, timeoutMs = 60_000): Promise<string> =>
        new Promise((resolve, reject) => {
            const waiter = { pattern, resolve };
            lineWaiters.push(waiter);
            setTimeout(() => {
                const index = lineWaiters.indexOf(waiter);
                if (index === -1) return;
                lineWaiters.splice(index, 1);
                reject(new Error(`server never printed ${pattern} (last: ${lines.at(-1) ?? '<nothing>'})`));
            }, timeoutMs).unref();
        });

    const seconds = options.seconds ?? 120;
    await Promise.race([
        waitForLine(/now listening on port/, seconds * 1000),
        exited.then(() => {
            throw new Error(`server exited during startup; output ends with: ${lines.slice(-10).join('\n')}`);
        })
    ]);

    return {
        port,
        dir,
        lines,
        command: (line) => child.stdin?.write(`${line}\n`),
        waitForLine,
        stop: async () => {
            if (child.exitCode !== null) return;
            child.stdin?.write('stop\n');
            const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
            await exited;
            clearTimeout(killer);
        }
    };
};
