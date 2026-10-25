import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

    it('closes on the next microtask when the channel is already disconnected', async () => {
        const listeners: string[] = [];
        const disconnected: IpcProcess = {
            connected: false,
            send: () => false,
            on: (event: string) => listeners.push(event),
            off: () => undefined
        };
        const link = childProcessLink({ validate: isConsoleMessage, proc: disconnected });
        const onClose = vi.fn();
        link.onClose(onClose);

        expect(onClose).not.toHaveBeenCalled();
        await Promise.resolve();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(listeners).toEqual([]);
        expect(link.send({ type: 'hello', v: 1, serverVersion: '1', pid: 1 })).toBe(false);
        await expect(link.flush()).resolves.toBeUndefined();
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
