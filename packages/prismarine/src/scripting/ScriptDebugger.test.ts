/**
 * The world host's script debugger, end to end on one machine: the real socket thread, a loopback
 * TCP connection, and a fake VS Code extension on a worker thread, over the parity suite's
 * `system-tasks` scenario pack. Nothing here waits on a clock: each step waits for the message
 * that the step before it causes.
 */
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { locateLibrary } from '@jsprismarine/script-host/library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ScriptDebuggerConfig } from '../config/Config';
import type {
    DebuggerExtensionCommand,
    DebuggerExtensionReport,
    DebuggerExtensionScript
} from '../testing/debuggerExtension.test.helper';
import { fakeLevel } from '../testing/level';
import { isRecord } from '../utils/isRecord';
import { LevelScripts } from './LevelScripts';
import { parseConnectAddress } from './ScriptDebugger';

/** Whether the script host library is built here, or CI asks for the test anyway. */
const scriptHostAvailable = (): boolean => {
    if (process.env.JSP_SCRIPT_HOST_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

/** The parity scenario pack: `system.run` callbacks that record what ran, from `worldLoad` on. */
const PACK = fileURLToPath(new URL('../../../parity/scenarios/system-tasks/tasks', import.meta.url));
const MODULE_UUID = '13f251b3-41c9-4271-b2d1-d4abde28890b';
const PACK_NAME = 'JSPrismarine scenario system-tasks tasks';
/** The line of `record('run A')`, the first `system.run` callback, found rather than counted. */
const RUN_A_LINE =
    readFileSync(`${PACK}/scripts/main.js`, 'utf8')
        .split('\n')
        .findIndex((line) => line.includes("record('run A');")) + 1;

const loader = new URL('../../../../scripts/native-typescript-loader.mjs', import.meta.url).href;

const OFF: ScriptDebuggerConfig = {
    allowInbound: false,
    allowOutbound: false,
    listenPort: 19_144,
    portForced: false,
    listenAddress: '127.0.0.1',
    autoAttach: 'disabled',
    autoAttachConnectAddress: '',
    autoAttachTimeout: 0,
    passcode: ''
};

/** The fake extension's thread, with every report it has sent, and a way to wait for one. */
class Extension {
    public readonly reports: DebuggerExtensionReport[] = [];
    private readonly worker: Worker;
    private waiters: (() => void)[] = [];

    public constructor(script: DebuggerExtensionScript) {
        this.worker = new Worker(new URL('../testing/debuggerExtension.test.helper.ts', import.meta.url), {
            workerData: script,
            execArgv: ['--import', loader]
        });
        this.worker.on('message', (report: DebuggerExtensionReport) => {
            this.reports.push(report);
            for (const waiter of this.waiters.splice(0)) waiter();
        });
    }

    /** The messages the extension received, in order. */
    public received(): Record<string, unknown>[] {
        return this.reports.flatMap((report) => (report.kind === 'received' ? [report.message] : []));
    }

    /** The events among them. */
    public events(): Record<string, unknown>[] {
        return this.received().flatMap((message) =>
            message.type === 'event' && isRecord(message.event) ? [message.event] : []
        );
    }

    /** Resolves once a report satisfies `found`, checking each as it arrives. */
    public async until<T>(found: (extension: Extension) => T | undefined | false): Promise<T> {
        for (;;) {
            const value = found(this);
            if (value !== undefined && value !== false) return value;
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        }
    }

    public send(command: DebuggerExtensionCommand): void {
        this.worker.postMessage(command);
    }

    public terminate(): Promise<number> {
        return this.worker.terminate();
    }
}

const extensions: Extension[] = [];
const loaded: LevelScripts[] = [];
afterEach(async () => {
    for (const scripts of loaded.splice(0)) scripts.close();
    await Promise.all(extensions.splice(0).map((extension) => extension.terminate()));
});

const extension = (script: DebuggerExtensionScript): Extension => {
    const started = new Extension(script);
    extensions.push(started);
    return started;
};

/** Loads the scenario pack's scripts with the debugger settings given, logging into `lines`. */
const load = async (
    settings: Partial<ScriptDebuggerConfig>,
    lines: Lines,
    extra: { replay?: boolean; sleep?: (seconds: number) => Promise<void> } = {}
): Promise<LevelScripts> => {
    const scripts = await LevelScripts.load({
        packDirectories: [PACK],
        configDirectory: undefined,
        sources: {
            dimensions: () => ['minecraft:overworld'],
            players: () => [],
            weather: fakeLevel().getWeather(),
            chat: { addGuard: () => () => {} },
            clock: () => 0
        },
        seed: 1n,
        watchdog: { enableShutdown: false, hangThreshold: 10_000, memoryLimit: 0 },
        log: {
            info: (message) => lines.push(`info ${message}`),
            warn: (message) => lines.push(`warn ${message}`),
            error: (message) => lines.push(`error ${message}`)
        },
        onShutdown: () => {},
        debugger: { settings: { ...OFF, ...settings }, replay: extra.replay ?? false, sleep: extra.sleep }
    });
    if (scripts === undefined) throw new Error('the scenario pack has a script module');
    loaded.push(scripts);
    return scripts;
};

/** The line of the pack's first statement that runs: its `worldLoad` subscription. */
const WORLD_LOAD_LINE =
    readFileSync(`${PACK}/scripts/main.js`, 'utf8')
        .split('\n')
        .findIndex((line) => line.startsWith('world.afterEvents.worldLoad.subscribe')) + 1;

/** A log a test can wait on: each line wakes whoever waits for one. */
class Lines {
    public readonly list: string[] = [];
    private waiters: (() => void)[] = [];

    public push(line: string): void {
        this.list.push(line);
        for (const waiter of this.waiters.splice(0)) waiter();
    }

    /** The debugger's lines, without the content log's other lines. */
    public debugger(): string[] {
        return this.list.filter((line) => /debugger/i.test(line));
    }

    /** Resolves once a line equal to `line` has been logged. */
    public async until(line: string): Promise<void> {
        while (!this.list.includes(line)) await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
}

/** A port nothing listens on now, which the operating system picked. */
const freePort = async (): Promise<number> => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    server.close();
    await once(server, 'close');
    if (address === null || typeof address === 'string') throw new Error('no TCP address');
    return address.port;
};

/** Whether a connection to a loopback port is refused. */
const refused = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => resolve(true));
    });

/** A sleep that never ends, for a timeout the test must not reach. */
const never = (): Promise<void> => new Promise(() => undefined);

/** The port a `Debugger listening on port N` reply names. */
const portOf = (message: string | undefined): number => Number(message?.split(' ').at(-1));

/** The frames of a `stackTrace` response's body, innermost first. */
const framesOf = (body: unknown): Record<string, unknown>[] => (Array.isArray(body) ? body.filter(isRecord) : []);

/** Whether the extension has received the response to a request of this command. */
const responded = (extension: Extension, seq: number) =>
    extension.received().find((message) => message.type === 'response' && message.request_seq === seq);

describe('parseConnectAddress', () => {
    it('reads host:port and refuses what BDS refuses', () => {
        expect(parseConnectAddress('localhost:19144')).toEqual({ host: 'localhost', port: 19_144 });
        expect(parseConnectAddress('[::1]:19144')).toEqual({ host: '::1', port: 19_144 });
        for (const address of ['nonsense', 'localhost:', ':19144', 'localhost:0', 'localhost:70000', 'host:12a']) {
            expect(parseConnectAddress(address)).toBeUndefined();
        }
    });
});

// Each test starts two worker threads that load TypeScript source, which a busy host can take a
// while to do; the budget guards against a hang, not a slow machine.
describe.skipIf(!scriptHostAvailable())('the script debugger', { timeout: 120_000 }, () => {
    it('refuses both directions while the properties keep them off, with BDS’s messages', async () => {
        const scripts = await load({}, new Lines());

        expect(await scripts.debugger.listen(0)).toEqual({ ok: false, message: 'Inbound connections are disabled' });
        expect(await scripts.debugger.connect('127.0.0.1', 1)).toEqual({
            ok: false,
            message: 'Outbound connections are disabled'
        });
        expect(await scripts.debugger.close()).toEqual({ ok: true, message: 'Debugger closed' });
    });

    it('refuses to listen beyond loopback without a passcode, as BDS does', async () => {
        const lines = new Lines();
        const scripts = await load({ allowInbound: true, listenAddress: '0.0.0.0' }, lines);

        expect(await scripts.debugger.listen(0)).toEqual({ ok: false, message: 'Failed to start debugger' });
        expect(lines.list).toEqual([
            'error [Scripting] Refusing to start script debugger listener on non-loopback address [0.0.0.0] without a passcode.'
        ]);
    });

    it('listens, attaches to the picked pack, stops at a breakpoint, continues, and closes', async () => {
        const lines = new Lines();
        const scripts = await load({ allowInbound: true }, lines);
        const reply = await scripts.debugger.listen(0);
        expect(reply?.message).toMatch(/^Debugger listening on port \d+$/);

        const vscode = extension({
            mode: 'connect',
            port: portOf(reply?.message),
            target: MODULE_UUID,
            breakpoints: { path: 'main.js', lines: [RUN_A_LINE] }
        });
        expect(await scripts.debugger.whenConnected()).toBe(true);
        scripts.start({ setScriptPhase: () => {} });
        expect(scripts.debugger.attached).toBe(true);
        for (let tick = 0; tick < 3; tick++) scripts.flush();
        // The stop happened inside a flush, which waited for the extension to continue.
        await vscode.until((ext) => ext.events().some((event) => event.type === 'StoppedEvent') && responded(ext, 3));

        expect(vscode.events()[0]).toEqual({
            type: 'ProtocolEvent',
            version: 11,
            plugins: [{ name: PACK_NAME, module_uuid: MODULE_UUID }]
        });
        expect(responded(vscode, 1)?.body).toEqual({ breakpoints: [{ verified: true }] });
        expect(vscode.events()).toContainEqual({ type: 'StoppedEvent', reason: 'breakpoint', thread: 1 });
        const [top] = framesOf(responded(vscode, 2)?.body);
        expect(top).toMatchObject({ filename: 'main.js', line: RUN_A_LINE });
        expect(lines.list).toContainEqual(
            expect.stringMatching(/^warn \[Scripting\] Debugger attached to \[127\.0\.0\.1\] on port \[\d+\]\.$/)
        );
        // The scripts went on after the stop, and their content log reached the debug console.
        expect(lines.list).toContainEqual(expect.stringContaining('"event":"run A"'));
        await vscode.until((ext) =>
            ext
                .events()
                .some(
                    (event) =>
                        event.type === 'PrintEvent' &&
                        typeof event.message === 'string' &&
                        event.message.includes('"event":"run A"')
                )
        );

        expect(await scripts.debugger.close()).toEqual({ ok: true, message: 'Debugger closed' });
        await vscode.until((ext) => ext.reports.some((report) => report.kind === 'closed'));
        expect(vscode.events().at(-1)).toEqual({ type: 'ThreadEvent', reason: 'exited', thread: 1 });
        expect(scripts.debugger.attached).toBe(false);
    });

    it('connects to an extension that listens, and logs the connection closing when it hangs up', async () => {
        const lines = new Lines();
        const scripts = await load({ allowOutbound: true }, lines);
        scripts.start({ setScriptPhase: () => {} });
        const vscode = extension({ mode: 'listen', target: MODULE_UUID });
        const port = await vscode.until((ext) =>
            ext.reports.flatMap((report) => (report.kind === 'listening' ? [report.port] : [])).at(0)
        );

        expect(await scripts.debugger.connect('127.0.0.1', port)).toEqual({
            ok: true,
            message: `Debugger connected to host 127.0.0.1 on port ${port}`
        });
        expect(lines.list).toContain(`warn [Scripting] Debugger attached to [127.0.0.1] on port [${port}].`);
        await vscode.until((ext) => ext.events().some((event) => event.type === 'PrintEvent' && event.logLevel === 2));
        expect(vscode.events()).toContainEqual({
            type: 'PrintEvent',
            message: `Debugger attached to [127.0.0.1] on port [${port}].`,
            logLevel: 2
        });

        vscode.send({ op: 'hang-up' });
        await lines.until('warn [Scripting] Debugger connection closed.');
        expect(scripts.debugger.attached).toBe(false);
    });

    it('refuses a wrong passcode with BDS’s line, in the log and in the debug console', async () => {
        const lines = new Lines();
        const scripts = await load({ allowInbound: true, passcode: 'hunter2' }, lines);
        const reply = await scripts.debugger.listen(0);
        const vscode = extension({
            mode: 'connect',
            port: portOf(reply?.message),
            target: MODULE_UUID,
            passcode: 'guess'
        });

        expect(await scripts.debugger.whenConnected()).toBe(false);
        await vscode.until((ext) => ext.reports.some((report) => report.kind === 'closed'));

        expect(vscode.events()[0]).toMatchObject({ type: 'ProtocolEvent', require_passcode: true });
        expect(vscode.events().at(-1)).toEqual({
            type: 'PrintEvent',
            message: 'Debugger connection failed, passcode mismatch.',
            logLevel: 3
        });
        expect(lines.list).toEqual(['error [Scripting] Debugger connection failed, passcode mismatch.']);
        expect(scripts.debugger.attached).toBe(false);
    });

    it('auto-attaches by connecting before the scripts start, and stops at the top level', async () => {
        const lines = new Lines();
        const vscode = extension({
            mode: 'listen',
            target: MODULE_UUID,
            breakpoints: { path: 'main.js', lines: [WORLD_LOAD_LINE] }
        });
        const port = await vscode.until((ext) =>
            ext.reports.flatMap((report) => (report.kind === 'listening' ? [report.port] : [])).at(0)
        );
        const scripts = await load(
            {
                allowOutbound: true,
                autoAttach: 'connect',
                autoAttachConnectAddress: `127.0.0.1:${port}`,
                autoAttachTimeout: 5
            },
            lines,
            { sleep: never }
        );

        await scripts.debugger.autoAttach();
        // The handshake passed before any script ran; the session attaches when the pack loads.
        expect(scripts.debugger.attached).toBe(false);
        scripts.start({ setScriptPhase: () => {} });
        await vscode.until((ext) => responded(ext, 3));

        const [top] = framesOf(responded(vscode, 2)?.body);
        expect(top).toMatchObject({ filename: 'main.js', line: WORLD_LOAD_LINE });
        expect(lines.debugger()).toEqual([
            'warn [Scripting] Debugger auto-attach waiting for [5] seconds.',
            `warn [Scripting] Debugger attached to [127.0.0.1] on port [${port}].`
        ]);
    });

    it('keeps listening when no debugger comes before the timeout', async () => {
        const lines = new Lines();
        const port = await freePort();
        const scripts = await load(
            { allowInbound: true, autoAttach: 'listen', listenPort: port, portForced: true, autoAttachTimeout: 0 },
            lines,
            { sleep: async () => {} }
        );

        await scripts.debugger.autoAttach();
        expect(lines.list).toEqual([
            'warn [Scripting] Debugger auto-attach waiting for [0] seconds.',
            'warn [Scripting] Debugger auto-attach did not connect, but is still listening.'
        ]);

        const vscode = extension({ mode: 'connect', port, target: MODULE_UUID });
        expect(await scripts.debugger.whenConnected()).toBe(true);
        await vscode.until((ext) => ext.events().some((event) => event.type === 'ProtocolEvent'));
    });

    it('logs why auto-attach cannot start, as BDS does', async () => {
        const outbound = new Lines();
        await (
            await load({ autoAttach: 'connect', autoAttachConnectAddress: 'localhost:1' }, outbound)
        ).debugger.autoAttach();
        const inbound = new Lines();
        await (await load({ autoAttach: 'listen' }, inbound)).debugger.autoAttach();
        const address = new Lines();
        await (
            await load({ allowOutbound: true, autoAttach: 'connect', autoAttachConnectAddress: 'nonsense' }, address)
        ).debugger.autoAttach();

        expect(outbound.list).toEqual([
            'warn [Scripting] Debugger auto-attach waiting for [0] seconds.',
            'error [Scripting] Debugger auto-attach failed, outbound connections are disabled.'
        ]);
        expect(inbound.list).toEqual([
            'warn [Scripting] Debugger auto-attach waiting for [0] seconds.',
            'error [Scripting] Debugger auto-attach failed, inbound connections are disabled.'
        ]);
        expect(address.list).toEqual([
            'error Invalid script debugger connect address, format must be host:port with port in the range [ 1, 65535 ]',
            'warn [Scripting] Debugger auto-attach waiting for [0] seconds.',
            'error [Scripting] Debugger auto-attach failed, outbound address or port is not valid.'
        ]);
    });

    it('never opens a socket during a replay, whatever the properties say', async () => {
        const lines = new Lines();
        const port = await freePort();
        const scripts = await load(
            {
                allowInbound: true,
                allowOutbound: true,
                autoAttach: 'listen',
                listenPort: port,
                portForced: true,
                autoAttachTimeout: 5
            },
            lines,
            { replay: true, sleep: never }
        );

        await scripts.debugger.autoAttach();
        expect(await scripts.debugger.listen(port)).toEqual({ ok: false, message: 'Inbound connections are disabled' });
        expect(await scripts.debugger.connect('127.0.0.1', port)).toEqual({
            ok: false,
            message: 'Outbound connections are disabled'
        });

        expect(lines.list).toEqual([]);
        expect(await refused(port)).toBe(true);
    });
});
