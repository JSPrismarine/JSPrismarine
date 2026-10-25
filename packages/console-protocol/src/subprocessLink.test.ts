import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isServerMessage } from './messages';
import type { ConsoleMessage, ServerMessage } from './messages';
import { subprocessLink } from './subprocessLink';

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/server.ts');
const children: ChildProcess[] = [];

const forkServer = () => {
    const child = fork(fixture, [], { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    children.push(child);
    return child;
};

const nextMessage = (link: ReturnType<typeof subprocessLink<ServerMessage, ConsoleMessage>>) =>
    new Promise<ServerMessage>((resolve) => {
        const off = link.onMessage((message) => {
            off();
            resolve(message);
        });
    });

afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
});

describe('subprocessLink', () => {
    it('round-trips hello, command, and result, dropping stray messages', async () => {
        const child = forkServer();
        const link = subprocessLink<ServerMessage, ConsoleMessage>(child, { validate: isServerMessage });
        const received: ServerMessage[] = [];
        link.onMessage((message) => received.push(message));

        await expect(nextMessage(link)).resolves.toMatchObject({
            type: 'hello',
            serverVersion: 'fixture',
            pid: child.pid
        });

        expect(link.send({ type: 'command', v: 1, id: 'c1', line: 'garbage' })).toBe(true);
        await expect(nextMessage(link)).resolves.toEqual({ type: 'command.result', v: 1, id: 'c1', ok: true });
        expect(received).toHaveLength(2);

        link.close();
    });

    it('closes when the child exits and still delivers what it flushed first', async () => {
        const child = forkServer();
        const link = subprocessLink<ServerMessage, ConsoleMessage>(child, { validate: isServerMessage });
        const closed = vi.fn();
        link.onClose(closed);
        await nextMessage(link);

        link.send({ type: 'command', v: 1, id: 'bye', line: 'exit' });
        await expect(nextMessage(link)).resolves.toMatchObject({ id: 'bye', ok: true });
        const [code] = await once(child, 'exit');

        expect(code).toBe(0);
        expect(closed).toHaveBeenCalledTimes(1);
        expect(link.send({ type: 'shutdown', v: 1 })).toBe(false);
    });

    it('closes once when the child disconnects after a shutdown message', async () => {
        const child = forkServer();
        const link = subprocessLink<ServerMessage, ConsoleMessage>(child, { validate: isServerMessage });
        const closed = vi.fn();
        link.onClose(closed);
        await nextMessage(link);

        link.send({ type: 'shutdown', v: 1 });
        await once(child, 'exit');

        expect(closed).toHaveBeenCalledTimes(1);
        link.close();
        expect(closed).toHaveBeenCalledTimes(1);
    });
});
