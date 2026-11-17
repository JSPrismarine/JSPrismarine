/**
 * The world host's half of the VS Code script debugger: the `script-debugger-*` and
 * `*-script-debugging` properties, `/script debugger listen|connect|close` and auto-attach, in the
 * words Bedrock Dedicated Server (BDS) prints for each.
 *
 * The sockets live on their own thread ({@link DebuggerThread}). A connection reaches this thread
 * as an event between ticks, which is the connection lane of
 * [ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md): the session offers
 * the protocol, answers the handshake once the extension's reply has arrived, and attaches to the
 * engine and context of the pack the extension picked. From then on each message the extension
 * sends wakes this thread to poll the session. A script that stops at a breakpoint stops inside
 * the world's tick, so the tick waits for the extension to resume it
 * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)). A replay never
 * opens a socket: debugger traffic is not an input, and an evaluation in a stopped frame could
 * change what the scripts do.
 *
 * The script host is an optional dependency, so this module imports its types only; the modules
 * it runs come in {@link ScriptDebuggerOptions.host}.
 */
import { DebuggerConnectionError } from '@jsprismarine/errors/script-host';
import type { ScriptContextId, ScriptEngine } from '@jsprismarine/script-host';
import type { DebuggerChannel, ScriptDebugSession } from '@jsprismarine/script-host/debugger/DebugSession';
import type { PortDebuggerChannel } from '@jsprismarine/script-host/debugger/channel';
import type { DebuggerPlugin, HostMessage } from '@jsprismarine/script-host/debugger/protocol';
import type { DebuggerThread, DebuggerThreadConnection } from '@jsprismarine/script-host/debugger/thread';
import type { ScriptPack } from '@jsprismarine/script-host/host/pack';
import type { ScriptLog } from '@jsprismarine/script-host/host/WorldScripts';

import type { ScriptDebuggerConfig } from '../config/Config';

/** The script host modules the debugger runs, which the caller imports. */
export interface ScriptDebuggerHost {
    readonly ScriptDebugSession: typeof ScriptDebugSession;
    readonly PortDebuggerChannel: typeof PortDebuggerChannel;
    readonly DebuggerThread: typeof DebuggerThread;
    /** `LogLevel` of the extension's protocol. */
    readonly LogLevel: { readonly log: number; readonly warn: number; readonly error: number };
    /** The port the extension and BDS use when none is given. */
    readonly DEFAULT_DEBUGGER_PORT: number;
    /** Reads a file of a pack, by its path relative to the pack; undefined outside it or when missing. */
    readonly readPackFile: (pack: ScriptPack, path: string) => string | undefined;
}

/** A pack the extension can debug: where its scripts run, and its files. */
export interface ScriptDebugTargetPack {
    readonly engine: ScriptEngine;
    readonly context: ScriptContextId;
    readonly pack: ScriptPack;
}

/** The scripts a debugger attaches to. */
export interface DebuggableScripts {
    /** The packs the extension may pick, as the protocol event lists them. */
    plugins(): readonly DebuggerPlugin[];
    /** The pack whose script module has `moduleUuid`, while it runs. */
    target(moduleUuid: string): ScriptDebugTargetPack | undefined;
}

/** What the debugger needs from the server. */
export interface ScriptDebuggerOptions {
    readonly settings: ScriptDebuggerConfig;
    readonly scripts: DebuggableScripts;
    readonly host: ScriptDebuggerHost;
    /** The server's log, which gets BDS's lines. */
    readonly log: ScriptLog;
    /** Whether the server replays a recorded session, when the debugger never opens a socket. */
    readonly replay: boolean;
    /**
     * Resolves after `seconds`, for auto-attach's timeout and its retries. It waits on the wall
     * clock only at startup, before the first tick, where nothing simulated reads it.
     */
    readonly sleep?: (seconds: number) => Promise<void>;
}

/** What a `/script debugger` command prints: feedback, an error, or nothing, as on BDS. */
export type ScriptDebuggerReply = { readonly ok: boolean; readonly message: string } | undefined;

/** The lines BDS prints for the debugger, from the pinned server's binary and its `en_US.lang`. */
export const ScriptDebuggerMessages = {
    listening: (port: number) => `Debugger listening on port ${port}`,
    connected: (host: string, port: number) => `Debugger connected to host ${host} on port ${port}`,
    closed: 'Debugger closed',
    failed: 'Failed to start debugger',
    inboundDisabled: 'Inbound connections are disabled',
    outboundDisabled: 'Outbound connections are disabled',
    attached: (address: string, port: number) => `Debugger attached to [${address}] on port [${port}].`,
    connectionClosed: 'Debugger connection closed.',
    autoAttachWaiting: (seconds: number) => `Debugger auto-attach waiting for [${seconds}] seconds.`,
    autoAttachNoConnection: 'Debugger auto-attach did not connect.',
    autoAttachStillListening: 'Debugger auto-attach did not connect, but is still listening.',
    autoAttachInboundDisabled: 'Debugger auto-attach failed, inbound connections are disabled.',
    autoAttachOutboundDisabled: 'Debugger auto-attach failed, outbound connections are disabled.',
    autoAttachBadAddress: 'Debugger auto-attach failed, outbound address or port is not valid.',
    invalidConnectAddress:
        'Invalid script debugger connect address, format must be host:port with port in the range [ 1, 65535 ]',
    invalidPort: (port: number, fallback: number) =>
        `Debugger auto-attach invalid port [${port}], using default [${fallback}].`
} as const;

/** The host `/script debugger connect` reaches when it names none. */
export const DEFAULT_CONNECT_HOST = 'localhost';

/** How long auto-attach's connect mode waits between attempts, in seconds. */
const CONNECT_RETRY_SECONDS = 0.5;

/** The folder of a pack BDS names script files from: the extension's paths start inside it. */
const SCRIPTS_FOLDER = 'scripts/';

/** Whether a number is a TCP port BDS accepts for the debugger. */
const isPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65_535;

/**
 * Reads `script-debugger-auto-attach-connect-address`, `host:port`.
 * @returns The host and port, or undefined when the text is not that form or the port is out of range.
 */
export const parseConnectAddress = (address: string): { host: string; port: number } | undefined => {
    const separator = address.lastIndexOf(':');
    if (separator <= 0) return undefined;
    // An IPv6 address is bracketed, as in `[::1]:19144`; the socket takes it bare.
    const host = address.slice(0, separator).replace(/^\[(.*)\]$/, '$1');
    const portText = address.slice(separator + 1);
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || !isPort(port)) return undefined;
    return { host, port };
};

const defaultSleep = (seconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/**
 * The channel of one connection, which can say whether a message waits without taking it, so the
 * handshake runs only once the extension's answer is there and never blocks the world's thread
 * on an extension that does not answer.
 */
class PeekableChannel implements DebuggerChannel {
    private readonly inner: PortDebuggerChannel;
    private readonly held: unknown[] = [];

    public constructor(inner: PortDebuggerChannel) {
        this.inner = inner;
    }

    public get closed(): boolean {
        return this.inner.closed;
    }

    /** Whether a message has arrived, or the connection has closed, so a read returns at once. */
    public get ready(): boolean {
        if (this.held.length > 0) return true;
        const message = this.inner.poll();
        if (message !== undefined) this.held.push(message);
        return message !== undefined || this.inner.closed;
    }

    public send(message: HostMessage): void {
        this.inner.send(message);
    }

    public receive(): unknown {
        return this.held.shift() ?? this.inner.receive();
    }

    public poll(): unknown {
        return this.held.shift() ?? this.inner.poll();
    }

    public close(): void {
        this.inner.close();
    }
}

/**
 * One connection from the protocol offer to its close. It is `offered` until the extension's answer
 * arrives, `accepted` while the pack it picked has no context yet, and `attached` from then on.
 */
interface Connection {
    readonly channel: PeekableChannel;
    readonly session: ScriptDebugSession;
    readonly peer: DebuggerThreadConnection;
    state: 'offered' | 'accepted' | 'attached';
    /** The script module UUID the extension picked, once it has answered. */
    target?: string;
    /** Settles once the handshake has passed, true, or the connection has failed, false. */
    readonly settled: Promise<boolean>;
    settle(accepted: boolean): void;
}

/** The debugger of one level's scripts. */
export class ScriptDebugger {
    private readonly options: ScriptDebuggerOptions;
    private thread: DebuggerThread | undefined;
    private connection: Connection | undefined;
    /** The pack the attached session debugs, for its file names. */
    private targetPack: ScriptPack | undefined;
    private disposed = false;
    /** Wakes {@link ScriptDebugger.whenConnected} when a connection arrives. */
    private waiters: (() => void)[] = [];

    public constructor(options: ScriptDebuggerOptions) {
        this.options = options;
    }

    /** Whether a session is attached to a pack's engine. */
    public get attached(): boolean {
        return this.connection?.state === 'attached';
    }

    /**
     * Resolves once the next connection, or the one in progress, has passed its handshake, which
     * attaches it or leaves it waiting for its pack to load; false when the connection fails first.
     */
    public async whenConnected(): Promise<boolean> {
        for (;;) {
            const connection = this.connection;
            if (connection !== undefined) return connection.settled;
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        }
    }

    /**
     * `/script debugger listen`: listens for the extension's `connect` mode.
     * @param port - The port the command names; the forced port, when set, takes its place.
     */
    public async listen(port: number = this.options.settings.listenPort): Promise<ScriptDebuggerReply> {
        const { settings } = this.options;
        if (!settings.allowInbound || this.options.replay) {
            return { ok: false, message: ScriptDebuggerMessages.inboundDisabled };
        }
        this.dropConnection();
        try {
            const listening = await this.startThread().listen({
                port: settings.portForced ? settings.listenPort : port,
                address: settings.listenAddress,
                passcode: settings.passcode
            });
            return { ok: true, message: ScriptDebuggerMessages.listening(listening) };
        } catch (error) {
            this.options.log.error(`[Scripting] ${errorText(error)}`);
            return { ok: false, message: ScriptDebuggerMessages.failed };
        }
    }

    /**
     * `/script debugger connect`: connects to the extension's `listen` mode, and replies once the
     * handshake has passed. A refused handshake prints BDS's line and replies nothing.
     */
    public async connect(
        host = DEFAULT_CONNECT_HOST,
        port = this.options.host.DEFAULT_DEBUGGER_PORT
    ): Promise<ScriptDebuggerReply> {
        if (!this.options.settings.allowOutbound || this.options.replay) {
            return { ok: false, message: ScriptDebuggerMessages.outboundDisabled };
        }
        this.dropConnection();
        try {
            await this.startThread().connect({ host, port });
        } catch {
            return { ok: false, message: ScriptDebuggerMessages.failed };
        }
        const accepted = (await this.connection?.settled) === true;
        return accepted ? { ok: true, message: ScriptDebuggerMessages.connected(host, port) } : undefined;
    }

    /** `/script debugger close`: detaches the session and stops listening. */
    public async close(): Promise<ScriptDebuggerReply> {
        this.dropConnection();
        await this.thread?.close();
        return { ok: true, message: ScriptDebuggerMessages.closed };
    }

    /**
     * Attaches as `script-debugger-auto-attach` asks, before the scripts start, and waits up to
     * `script-debugger-auto-attach-timeout` seconds for the extension. A replay skips it.
     */
    public async autoAttach(): Promise<void> {
        const { settings, log, replay } = this.options;
        if (settings.autoAttach === 'disabled' || replay) return;
        const target =
            settings.autoAttach === 'connect' ? parseConnectAddress(settings.autoAttachConnectAddress) : undefined;
        if (settings.autoAttach === 'connect' && target === undefined && settings.autoAttachConnectAddress !== '') {
            log.error(ScriptDebuggerMessages.invalidConnectAddress);
        }
        const seconds = settings.autoAttachTimeout;
        log.warn(`[Scripting] ${ScriptDebuggerMessages.autoAttachWaiting(seconds)}`);
        const sleep = this.options.sleep ?? defaultSleep;
        let expired = false;
        const deadline = sleep(seconds).then(() => {
            expired = true;
        });

        if (settings.autoAttach === 'listen') {
            if (!settings.allowInbound) {
                log.error(`[Scripting] ${ScriptDebuggerMessages.autoAttachInboundDisabled}`);
                return;
            }
            let port = settings.listenPort;
            if (!isPort(port)) {
                const fallback = this.options.host.DEFAULT_DEBUGGER_PORT;
                log.warn(`[Scripting] ${ScriptDebuggerMessages.invalidPort(port, fallback)}`);
                port = fallback;
            }
            try {
                await this.startThread().listen({ port, address: settings.listenAddress, passcode: settings.passcode });
            } catch (error) {
                log.error(`[Scripting] ${errorText(error)}`);
                return;
            }
            const accepted = await Promise.race([this.whenConnected(), deadline.then(() => false)]);
            if (!accepted) log.warn(`[Scripting] ${ScriptDebuggerMessages.autoAttachStillListening}`);
            return;
        }

        if (!settings.allowOutbound) {
            log.error(`[Scripting] ${ScriptDebuggerMessages.autoAttachOutboundDisabled}`);
            return;
        }
        if (target === undefined) {
            log.error(`[Scripting] ${ScriptDebuggerMessages.autoAttachBadAddress}`);
            return;
        }
        for (;;) {
            try {
                await this.startThread().connect(target);
                const settled = this.connection?.settled ?? Promise.resolve(false);
                if (await Promise.race([settled, deadline.then(() => false)])) return;
                // The extension has not answered by the deadline: the handshake goes on between ticks.
                if (expired) return;
            } catch {
                // Not listening yet; try again until the deadline.
            }
            if (expired) break;
            await Promise.race([sleep(CONNECT_RETRY_SECONDS), deadline]);
            if (expired) break;
        }
        log.warn(`[Scripting] ${ScriptDebuggerMessages.autoAttachNoConnection}`);
    }

    /** Shows a line of the scripts' content log in the extension's debug console. */
    public print(message: string, level: 'info' | 'warn' | 'error'): void {
        const connection = this.connection;
        if (connection?.state !== 'attached') return;
        const { LogLevel } = this.options.host;
        connection.session.print(
            message,
            level === 'error' ? LogLevel.error : level === 'warn' ? LogLevel.warn : LogLevel.log
        );
    }

    /**
     * Attaches a session that waits for this pack, now that its context is ready and before any
     * of its scripts run, so the extension's breakpoints stop its first lines.
     */
    public packLoaded(moduleUuid: string): void {
        const connection = this.connection;
        if (connection?.state !== 'accepted' || connection.target !== moduleUuid.toLowerCase()) return;
        const picked = this.options.scripts.target(moduleUuid);
        if (picked !== undefined) this.attach(connection, picked);
    }

    /**
     * Ends the session before `/reload` replaces the engine it is attached to. The extension sees
     * the scripts' thread exit and the connection close.
     */
    public detachForReload(): void {
        if (this.connection?.state !== 'attached') return;
        this.dropConnection();
        this.options.log.warn(`[Scripting] ${ScriptDebuggerMessages.connectionClosed}`);
    }

    /** Closes the session and stops the socket thread, when the server stops. */
    public async dispose(): Promise<void> {
        this.disposed = true;
        this.dropConnection();
        const thread = this.thread;
        this.thread = undefined;
        await thread?.terminate();
    }

    private startThread(): DebuggerThread {
        if (this.thread !== undefined) return this.thread;
        const thread = new this.options.host.DebuggerThread({
            connected: (connection) => this.connected(connection),
            activity: () => this.activity()
        });
        this.thread = thread;
        return thread;
    }

    /** A new connection: offer the protocol, and wait for the answer without blocking. */
    private connected(peer: DebuggerThreadConnection): void {
        const { host, scripts, settings } = this.options;
        if (this.disposed) {
            new host.PortDebuggerChannel(peer.endpoint).close();
            return;
        }
        this.dropConnection();
        const channel = new PeekableChannel(new host.PortDebuggerChannel(peer.endpoint));
        const session = new host.ScriptDebugSession(channel, {
            plugins: scripts.plugins(),
            passcode: settings.passcode,
            toDebuggerPath: (file) => (file.startsWith(SCRIPTS_FOLDER) ? file.slice(SCRIPTS_FOLDER.length) : file),
            fromDebuggerPath: (path) => `${SCRIPTS_FOLDER}${path.replaceAll('\\', '/').replace(/^\/+/, '')}`,
            knowsFile: (file) => this.targetPack !== undefined && host.readPackFile(this.targetPack, file) !== undefined
        });
        let settle: (attached: boolean) => void = () => undefined;
        const settled = new Promise<boolean>((resolve) => {
            settle = resolve;
        });
        this.connection = { channel, session, peer, state: 'offered', settled, settle };
        for (const waiter of this.waiters.splice(0)) waiter();
        session.offer();
        this.activity();
    }

    /** The extension sent something, or went away: answer the handshake, or poll the session. */
    private activity(): void {
        const connection = this.connection;
        if (connection === undefined) return;
        if (connection.state === 'offered') {
            if (connection.channel.ready) this.handshake(connection);
            return;
        }
        // An accepted session reads nothing until it attaches: the configuration waits in the channel.
        if (connection.state === 'accepted') {
            if (connection.channel.closed) this.closedByExtension(connection);
            return;
        }
        connection.session.poll();
        if (connection.session.closed) this.closedByExtension(connection);
    }

    private closedByExtension(connection: Connection): void {
        this.drop(connection);
        this.options.log.warn(`[Scripting] ${ScriptDebuggerMessages.connectionClosed}`);
    }

    /**
     * Checks the extension's answer, then attaches to the pack it picked, or waits for that pack's
     * context when its scripts have not loaded yet, as at auto-attach.
     */
    private handshake(connection: Connection): void {
        const { host, scripts, log } = this.options;
        let target: string | undefined;
        try {
            target = (connection.session.handshake() ?? scripts.plugins()[0]?.module_uuid)?.toLowerCase();
        } catch (error) {
            if (error instanceof DebuggerConnectionError && !connection.session.closed) {
                log.error(`[Scripting] ${error.message}`);
                connection.session.print(error.message, host.LogLevel.error);
            }
            this.drop(connection);
            return;
        }
        if (target === undefined) {
            this.drop(connection);
            return;
        }
        connection.target = target;
        const picked = scripts.target(target);
        if (picked === undefined) {
            connection.state = 'accepted';
            connection.settle(true);
            return;
        }
        this.attach(connection, picked);
    }

    /** Attaches to a pack's context, which blocks this thread until the extension sends `resume`. */
    private attach(connection: Connection, picked: ScriptDebugTargetPack): void {
        const { host, log } = this.options;
        this.targetPack = picked.pack;
        connection.session.attach(picked.engine, picked.context);
        if (connection.session.closed) {
            this.drop(connection);
            return;
        }
        connection.state = 'attached';
        const attached = ScriptDebuggerMessages.attached(connection.peer.address, connection.peer.port);
        log.warn(`[Scripting] ${attached}`);
        connection.session.print(attached, host.LogLevel.warn);
        connection.settle(true);
    }

    /** Ends the current connection, if any. */
    private dropConnection(): void {
        if (this.connection !== undefined) this.drop(this.connection);
    }

    private drop(connection: Connection): void {
        if (this.connection === connection) this.connection = undefined;
        if (!connection.session.closed) connection.session.detach();
        connection.channel.close();
        connection.settle(false);
        this.targetPack = undefined;
    }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
