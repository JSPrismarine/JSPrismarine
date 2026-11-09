/**
 * What happens to the generation host when the server goes away or is interrupted.
 *
 * The terminal sends Ctrl+C to the whole process group, so the host sees the same SIGINT as the
 * server, and the server decides when generation stops. A server that exits at once on a second
 * Ctrl+C, or is killed, must not leave a host running.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { workerExecArgv } from './GenerationPool';

const PARENT = fileURLToPath(new URL('../test/hostParent.mts', import.meta.url));
const running: number[] = [];

/** The loader a TypeScript script needs, found the way the pool finds one for the host entry. */
const LOADER_FLAGS = workerExecArgv({ pipeline: PARENT, worker: PARENT }, { execArgv: [], nodeOptions: '' }) ?? [];

afterEach(() => {
    for (const pid of running.splice(0)) {
        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            // Already gone, which is the point of these tests.
        }
    }
});

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/** Checks a condition up to `attempts` times, a short pause apart, so no clock is read. */
const until = async (condition: () => boolean, attempts: number): Promise<boolean> => {
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (condition()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return condition();
};

/** Starts the stand-in server and resolves with it and the pid of its host. */
const startServer = async () => {
    const parent = spawn(process.execPath, [...LOADER_FLAGS, PARENT], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        stdio: ['ignore', 'pipe', 'inherit']
    });
    running.push(parent.pid!);
    const hostPid = await new Promise<number>((resolve, reject) => {
        let output = '';
        parent.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
            const match = /host (\d+)/.exec(output);
            if (match !== null) resolve(Number(match[1]));
        });
        parent.once('exit', () => reject(new Error(`the stand-in server exited early: ${output}`)));
    });
    running.push(hostPid);

    return { parent, hostPid };
};

describe('the generation host outside the server', () => {
    // Windows has no signal to ignore: Node terminates the target of any `process.kill` there,
    // and a console Ctrl+C reaches the host through the console, not through this call.
    it.skipIf(process.platform === 'win32')(
        'survives a SIGINT meant for the server, which decides when generation stops',
        async () => {
            const { hostPid } = await startServer();

            process.kill(hostPid, 'SIGINT');
            await new Promise((resolve) => setTimeout(resolve, 500));

            expect(alive(hostPid)).toBe(true);
        },
        60_000
    );

    it('exits when the server exits at once, as a second Ctrl+C does', async () => {
        const { parent, hostPid } = await startServer();

        parent.kill('SIGKILL');

        expect(await until(() => !alive(hostPid), 200)).toBe(true);
    }, 60_000);

    it('exits when the server is stopped normally and destroys its pool', async () => {
        const { parent, hostPid } = await startServer();

        parent.kill('SIGTERM');

        expect(await until(() => !alive(hostPid), 200)).toBe(true);
    }, 60_000);
});
