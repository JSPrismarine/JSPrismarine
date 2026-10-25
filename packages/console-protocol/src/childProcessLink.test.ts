import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { IpcProcess } from './childProcessLink';
import { childProcessLink } from './childProcessLink';
import { isConsoleMessage } from './messages';

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/server.ts');
const children: ChildProcess[] = [];

afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
});

describe('childProcessLink', () => {
    it('throws when the process has no IPC channel', () => {
        const noChannel: IpcProcess = { connected: false, on: () => undefined, off: () => undefined };
        expect(() => childProcessLink({ validate: isConsoleMessage, proc: noChannel })).toThrow(/IPC channel/);
    });

    it('closes in the child when the host disconnects the channel', async () => {
        const child = fork(fixture, [], { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
        children.push(child);
        await once(child, 'message');

        child.disconnect();
        const [code] = await once(child, 'exit');

        expect(code).toBe(3);
    });
});
