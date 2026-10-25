import type { ServerMessage } from '@jsprismarine/console-protocol';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerChild } from './ServerChild';
import { spawnServerChild } from './ServerChild';

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/server.ts');
const children: ServerChild[] = [];

const spawnFixture = async (
    userArgs: readonly string[] = [],
    stop: { shutdownGraceMs?: number; killGraceMs?: number } = {}
) => {
    const child = await spawnServerChild({
        userArgs,
        launch: { execArgv: ['--no-warnings'], scriptArgs: [fixture] },
        ...stop
    });
    children.push(child);
    return child;
};

const exited = (child: ServerChild) =>
    new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
        child.onExit((code, signal) => done({ code, signal }));
    });

const nextMessage = (child: ServerChild) =>
    new Promise<ServerMessage>((done) => {
        const off = child.link.onMessage((message) => {
            off();
            done(message);
        });
    });

const collectOutput = (child: ServerChild, count: number) =>
    new Promise<string[]>((done) => {
        const lines: string[] = [];
        child.onOutput((stream, text) => {
            lines.push(`${stream}: ${text}`);
            if (lines.length === count) done(lines);
        });
    });

afterEach(() => {
    for (const child of children.splice(0)) child.kill();
});

describe('spawnServerChild', () => {
    it('passes the user arguments through and appends the server role', async () => {
        const child = await spawnFixture(['--port', '19133']);
        const output = collectOutput(child, 3);

        await expect(nextMessage(child)).resolves.toMatchObject({ type: 'hello', pid: child.pid });
        expect(await output).toEqual([
            'stdout: argv ["--port","19133","--role","server"]',
            'stdout: second line',
            'stderr: warning line'
        ]);
    });

    it('drops messages that are not server messages', async () => {
        const child = await spawnFixture();
        const received: ServerMessage[] = [];
        child.link.onMessage((message) => received.push(message));
        await nextMessage(child);

        expect(child.link.send({ type: 'command', v: 1, id: 'c1', line: 'version' })).toBe(true);
        await expect(nextMessage(child)).resolves.toMatchObject({ type: 'command.result', id: 'c1' });
        expect(received.map((message) => message.type)).toEqual(['hello', 'command.result']);
    });

    it('stops a cooperative child with the shutdown message alone', async () => {
        const child = await spawnFixture();
        await nextMessage(child);

        child.stop();

        await expect(exited(child)).resolves.toEqual({ code: 0, signal: null });
    });

    it('escalates to SIGTERM and then SIGKILL when the child ignores the request', async () => {
        const child = await spawnFixture(['--stubborn'], { shutdownGraceMs: 50, killGraceMs: 200 });
        await nextMessage(child);

        child.stop();

        await expect(exited(child)).resolves.toEqual({ code: null, signal: 'SIGKILL' });
    });

    it('reports a spawn that fails as an exit with code 1 and a closed link', async () => {
        const child = await spawnServerChild({
            userArgs: [],
            launch: { execPath: '/nonexistent/node', execArgv: [], scriptArgs: [fixture] }
        });
        children.push(child);
        const closed = new Promise<void>((done) => child.link.onClose(done));

        await expect(exited(child)).resolves.toEqual({ code: 1, signal: null });
        await closed;
        expect(child.pid).toBeUndefined();
        expect(child.link.send({ type: 'shutdown', v: 1 })).toBe(false);
    });

    it('closes the link when the child exits', async () => {
        const child = await spawnFixture();
        await nextMessage(child);
        const closed = new Promise<void>((done) => child.link.onClose(done));

        child.kill();

        await exited(child);
        await closed;
        expect(child.link.send({ type: 'shutdown', v: 1 })).toBe(false);
    });
});
