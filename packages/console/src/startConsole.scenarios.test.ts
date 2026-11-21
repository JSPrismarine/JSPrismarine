import type { ConsoleMessage, ServerMessage } from '@jsprismarine/console-protocol';
import { isServerMessage, subprocessLink } from '@jsprismarine/console-protocol';
import type { ChildProcess } from 'node:child_process';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServerLink } from './startConsole';
import type { TestConsole } from './testing/console.test-utils';
import { startTestConsole } from './testing/console.test-utils';
import type { ScriptStep, StubServerOptions } from './testing/stubServer.test-utils';
import { COMMANDS, STARTUP } from './testing/stubServer.test-utils';

/**
 * The console against a scripted server: the real `startConsole`, its app and its request
 * plumbing, on OpenTUI's test renderer, with a stub that speaks the console protocol in place
 * of a server. `STARTUP` follows the order `Server.test.ts` in `@jsprismarine/prismarine`
 * pins for a real server, and the hostile cases send what the protocol allows but today's
 * server does not.
 */

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/stubServer.ts');

/** `STARTUP` up to and including its first step that matches. */
const startupUntil = (match: (step: ScriptStep) => boolean): ScriptStep[] =>
    STARTUP.slice(0, STARTUP.findIndex(match) + 1);

const frame = (t: TestConsole): string => t.test.captureCharFrame();

const pressCtrlK = (t: TestConsole): void => t.test.mockInput.pressKey('k', { ctrl: true });

/** Opens the palette, searches it, and returns the frame once the query shows. */
async function searchPalette(t: TestConsole, query: string): Promise<string> {
    pressCtrlK(t);
    await t.test.mockInput.typeText(query);
    await t.test.waitForFrame((text) => text.includes(`› ${query}`));
    return frame(t);
}

describe('startConsole against a stub server', () => {
    let t: TestConsole | undefined;
    const children: ChildProcess[] = [];

    afterEach(async () => {
        await t?.handle.close();
        t = undefined;
        for (const child of children.splice(0)) child.kill('SIGKILL');
    });

    async function started(options?: StubServerOptions) {
        t = await startTestConsole();
        const stub = t.connect(options);
        await stub.play(STARTUP);
        await t.test.waitForFrame((text) => text.includes('type a command'));
        return { t, stub };
    }

    it('shows the running startup step in the footer and drops it once the server is running', async () => {
        // Narrow enough that the side pane, which lists every step, is hidden.
        t = await startTestConsole({ width: 80, height: 24 });
        const stub = t.connect();

        await stub.play(startupUntil((step) => 'step' in step && step.step === 'prismarine:content'));
        await t.test.waitForFrame((text) => text.includes('content…'));

        await stub.play(STARTUP.slice(startupUntil((step) => 'step' in step && step.state === 'started').length));
        await t.test.waitForFrame((text) => !text.includes('content…') && !text.includes('world…'));
        // Once for the hello and again once running, when a real server has every command.
        await stub.waitFor('commands', 2);
    });

    it('lists the server commands in the palette and shows a command form while typing', async () => {
        const { t } = await started();

        expect(await searchPalette(t, 'say')).toContain('Broadcasts a message.');
        pressCtrlK(t);
        await t.test.waitForFrame((text) => !text.includes('Broadcasts a message.'));

        await t.test.mockInput.typeText('say ');
        await t.test.waitForFrame((text) => text.includes('say <message>'));
    });

    it('sends a typed command and shows the error the server answers with', async () => {
        const { t, stub } = await started({ results: { 'say hi': { ok: false, error: 'You may not say that.' } } });

        await t.test.mockInput.typeText('say hi');
        t.test.mockInput.pressEnter();

        await t.test.waitForFrame((text) => text.includes('You may not say that.'));
        expect(stub.received.filter((message) => message.type === 'command')).toMatchObject([{ line: 'say hi' }]);
    });

    it('stops the server on a second Ctrl+C and says so once the link closes', async () => {
        const { t, stub } = await started();

        t.test.mockInput.pressCtrlC();
        t.test.mockInput.pressCtrlC();
        await stub.waitFor('shutdown');
        t.supervisor.emit({ type: 'supervisor.state', state: 'stopped', code: 0, generation: 1 });

        await t.test.waitForFrame((text) => text.includes('server is not running'));
        expect(t.supervisor.actions).toEqual(['stop']);
    });

    it('shows the crash and starts a new server on r, learning that server’s commands', async () => {
        const { t, stub } = await started();
        t.supervisor.emit({ type: 'supervisor.watching', root: '/repo', canRestart: true });
        t.supervisor.emit({
            type: 'supervisor.output',
            stream: 'stderr',
            text: 'TypeError: boom\n    at load (/repo/packages/prismarine/src/Server.ts:10:5)\n'
        });
        stub.close();
        t.supervisor.emit({ type: 'supervisor.state', state: 'crashed', code: 1, generation: 1 });
        await t.test.waitForFrame((text) => text.includes('TypeError: boom'));

        t.test.mockInput.pressKey('r');
        expect(t.supervisor.actions).toEqual(['restart']);

        const next = t.connect({
            commands: [[{ name: 'reload', description: 'Reloads.', aliases: [], usage: ['reload'] }]]
        });
        t.supervisor.emit({ type: 'supervisor.state', state: 'starting', generation: 2 });
        await next.play(STARTUP);
        await t.test.waitForFrame((text) => text.includes('type a command'));
        expect(await searchPalette(t, 'reload')).toContain('Reloads.');
    });

    describe('hostile servers', () => {
        it('learns the commands from a server that lists none until it is running', async () => {
            const { t } = await started({ commands: [[], COMMANDS] });

            expect(await searchPalette(t, 'say')).toContain('Broadcasts a message.');
        });

        it('keeps an early command list that arrives late when the later request goes unanswered', async () => {
            t = await startTestConsole();
            const stub = t.connect({ hold: ['commands'] });
            await stub.play(STARTUP);
            await stub.waitFor('commands', 2);

            // The request sent on hello is answered only now, after the one sent on running.
            stub.release('commands', 1);

            await t.test.mockInput.typeText('say ');
            await t.test.waitForFrame((text) => text.includes('say <message>'));
        });

        it('fails a command in flight when the link closes, and turns the command line off', async () => {
            const { t, stub } = await started({ hold: ['command'] });

            await t.test.mockInput.typeText('say hi');
            t.test.mockInput.pressEnter();
            await stub.waitFor('command');
            stub.close();

            await t.test.waitForFrame((text) => text.includes('say hi: ') || text.includes('link closed'));
            await t.test.waitForFrame((text) => !text.includes('type a command'));
        });

        it('ignores answers to requests it never sent', async () => {
            const { t, stub } = await started();

            stub.send({ type: 'command.result', id: 'not-mine', ok: false, error: 'An answer nobody asked for.' });
            stub.send({ type: 'commands.result', id: 'not-mine', commands: [] });
            stub.send({ type: 'lifecycle', state: 'running' });
            await stub.waitFor('commands', 3);

            expect(frame(t)).not.toContain('An answer nobody asked for.');
            expect(await searchPalette(t, 'say')).toContain('Broadcasts a message.');
        });
    });

    describe('over a process channel', () => {
        /** Resolves with the first message from the link that matches. */
        const nextMessage = (link: ServerLink, match: (message: ServerMessage) => boolean): Promise<void> =>
            new Promise((resolve) => {
                const off = link.onMessage((message) => {
                    if (!match(message)) return;
                    off();
                    resolve();
                });
            });

        function spawnStub(options: StubServerOptions, script: readonly ScriptStep[]) {
            const child = fork(fixture, [JSON.stringify({ options, script })], {
                execArgv: ['--no-warnings'],
                stdio: ['ignore', 'ignore', 'inherit', 'ipc']
            });
            children.push(child);
            return { child, link: subprocessLink<ServerMessage, ConsoleMessage>(child, { validate: isServerMessage }) };
        }

        it('starts, runs a command and stops a server in another process', async () => {
            t = await startTestConsole();
            const { child, link } = spawnStub(
                { results: { 'say hi': { ok: false, error: 'Not from here.' } } },
                STARTUP
            );
            const running = nextMessage(link, (message) => message.type === 'lifecycle' && message.state === 'running');
            t.supervisor.attach(link);
            await running;
            await t.test.waitForFrame((text) => text.includes('type a command'));

            const answered = nextMessage(link, (message) => message.type === 'command.result');
            await t.test.mockInput.typeText('say hi');
            t.test.mockInput.pressEnter();
            await answered;
            await t.test.waitForFrame((text) => text.includes('Not from here.'));

            const exited = once(child, 'exit');
            t.test.mockInput.pressCtrlC();
            t.test.mockInput.pressCtrlC();
            const [code] = await exited;
            t.supervisor.emit({ type: 'supervisor.state', state: 'stopped', code, generation: 1 });

            expect(code).toBe(0);
            await t.test.waitForFrame((text) => text.includes('server is not running'));
        });
    });
});
