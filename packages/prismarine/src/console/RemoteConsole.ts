import type { ConsoleMessage, LifecycleState, ServerMessage } from '@jsprismarine/console-protocol';
import { PROTOCOL_VERSION } from '@jsprismarine/console-protocol';
import type Server from '../Server';
import { completeCommand } from '../Console';
import { consoleTextOf } from '../chat/ConsoleText';
import type ChatEvent from '../events/chat/ChatEvent';
import type { Service } from '../utils/Service';
import type { FlushableLink, RemoteLogTransport } from './RemoteLogTransport';

/** Options for {@link RemoteConsole}. */
export interface RemoteConsoleOptions {
    /** How often a `status` message is considered, in milliseconds; defaults to 1000. */
    statusIntervalMs?: number;
    /**
     * Longest gap between two `status` messages while nothing changes, in milliseconds;
     * defaults to 5000. Within it a status whose TPS and player counts match the last one
     * sent is skipped.
     */
    statusKeepAliveMs?: number;
    /** Longest wait for the link to drain in {@link RemoteConsole.disable}, in milliseconds; defaults to 500. */
    flushTimeoutMs?: number;
}

/** The parts of a `status` message that decide whether a new one is worth sending. */
const statusKey = (status: Extract<ServerMessage, { type: 'status' }>): string =>
    `${status.tps}|${status.players}|${status.maxPlayers}`;

/**
 * The server end of the remote console: the service a headless server runs when a host
 * process owns the terminal.
 *
 * It speaks the console protocol over the link it is given. Log records travel through the
 * {@link RemoteLogTransport} the caller already handed to the logger; this class drives the
 * rest: `hello` and `lifecycle` on the way up, `status` once a second while something
 * changed, `command` and `complete` round trips, the `subscribe` level, and a graceful
 * `server.shutdown()` when the host asks for one or disappears. Chat reaches the log here
 * too, as the line console would have done, so a headless server still records it.
 *
 * The server calls {@link enable} at the start of `bootstrap`, {@link markRunning} once it
 * listens, {@link markStopping} when `shutdown` begins, and {@link disable} right before the
 * process exits, so the last messages get out of the IPC channel first.
 */
export class RemoteConsole implements Service {
    private readonly statusIntervalMs: number;
    private readonly statusKeepAliveMs: number;
    private readonly flushTimeoutMs: number;
    private enabled = false;
    private disabled = false;
    private shutdownRequested = false;
    private lastLifecycle: LifecycleState | undefined;
    private lastStatusKey: string | undefined;
    private lastStatusAt = 0;
    private statusTimer: NodeJS.Timeout | undefined;
    private readonly unsubscribe: Array<() => void> = [];
    /** Ids of `command` messages whose dispatch has not settled yet. */
    private readonly inFlight = new Set<string>();

    /**
     * @param server - The server this console speaks for.
     * @param link - The server end of the console link.
     * @param transport - The log transport the logger already writes to; `subscribe` sets its level.
     */
    public constructor(
        private readonly server: Server,
        private readonly link: FlushableLink<ConsoleMessage, ServerMessage>,
        private readonly transport: RemoteLogTransport,
        options: RemoteConsoleOptions = {}
    ) {
        this.statusIntervalMs = options.statusIntervalMs ?? 1000;
        this.statusKeepAliveMs = options.statusKeepAliveMs ?? 5000;
        this.flushTimeoutMs = options.flushTimeoutMs ?? 500;
    }

    /**
     * Sends `hello` and `lifecycle starting`, starts answering the host, and begins the
     * status ticker. Calling it again does nothing.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        if (this.enabled) return;
        this.enabled = true;

        this.send({ type: 'hello', v: PROTOCOL_VERSION, serverVersion: this.server.getVersion(), pid: process.pid });
        this.sendLifecycle('starting');

        this.unsubscribe.push(this.link.onMessage((message) => this.handle(message)));
        this.unsubscribe.push(this.link.onClose(() => this.requestShutdown()));

        // The line console logs chat when it exists. Without one this is the only path that
        // puts chat in the log, and with one it would log every line twice.
        if (!this.server.getConsole()) {
            const onChat = (event: ChatEvent): void => {
                if (event.isCanceled()) return;
                this.server.getLogger().info(consoleTextOf(event.getChat()));
            };
            this.server.on('chat', onChat);
            this.unsubscribe.push(() => this.server.removeListener('chat', onChat));
        }

        this.statusTimer = setInterval(() => this.sendStatus(), this.statusIntervalMs);
        this.statusTimer.unref();
    }

    /** Reports `lifecycle running`. The server calls it once it listens on its port. */
    public markRunning(): void {
        this.sendLifecycle('running');
    }

    /** Reports `lifecycle stopping`. The server calls it as `shutdown` begins; repeats are ignored. */
    public markStopping(): void {
        if (this.lastLifecycle === 'stopping') return;
        this.sendLifecycle('stopping');
    }

    /**
     * Answers every command still running with `ok: true`, sends `lifecycle stopping` if it
     * has not gone out yet, closes the log transport, and waits up to `flushTimeoutMs` for
     * the link to drain, so a `process.exit` that follows does not discard the queued
     * messages. Links without `flush` return at once.
     *
     * A command whose dispatch is still pending here is one that stopped the server, such as
     * `stop`: its `await server.shutdown()` never settles because `shutdown` exits the
     * process. Answering it now is the only way the host sees a result instead of a closed
     * link.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        if (this.disabled) return;
        this.disabled = true;

        if (this.statusTimer) clearInterval(this.statusTimer);
        this.statusTimer = undefined;
        for (const remove of this.unsubscribe.splice(0)) remove();

        for (const id of this.inFlight) this.send({ type: 'command.result', v: PROTOCOL_VERSION, id, ok: true });
        this.inFlight.clear();

        this.markStopping();
        this.transport.close();

        if (!this.link.flush) return;
        await Promise.race([this.link.flush(), this.sleep(this.flushTimeoutMs)]);
    }

    private handle(message: ConsoleMessage): void {
        switch (message.type) {
            case 'command':
                void this.runCommand(message.id, message.line);
                return;
            case 'complete': {
                const names = Array.from(this.server.getCommandManager().getCommands().values()).map(
                    (command) => command.name
                );
                const [completions, replace] = completeCommand(names, message.line.slice(0, message.cursor));
                this.send({ type: 'complete.result', v: PROTOCOL_VERSION, id: message.id, completions, replace });
                return;
            }
            case 'subscribe':
                this.transport.setLevel(message.level);
                return;
            case 'shutdown':
                this.requestShutdown();
                return;
        }
    }

    private async runCommand(id: string, line: string): Promise<void> {
        const sender = this.server.getConsoleSender();
        this.inFlight.add(id);
        try {
            const ok = await this.server.getCommandManager().dispatchCommand(sender, sender, line);
            // Already answered by `disable` when the id is gone.
            if (!this.inFlight.delete(id)) return;
            this.send({ type: 'command.result', v: PROTOCOL_VERSION, id, ok });
        } catch (error: unknown) {
            if (!this.inFlight.delete(id)) return;
            const text = error instanceof Error ? error.message : String(error);
            this.send({ type: 'command.result', v: PROTOCOL_VERSION, id, ok: false, error: text });
        }
    }

    /** Starts the server's own graceful shutdown, once. */
    private requestShutdown(): void {
        if (this.shutdownRequested) return;
        this.shutdownRequested = true;
        void this.server.shutdown();
    }

    private sendStatus(): void {
        const tps = this.server.getTPS();
        const status: ServerMessage = {
            type: 'status',
            v: PROTOCOL_VERSION,
            tps,
            // The server keeps no per-tick duration; this is the period the current rate
            // implies, so it reads 50 at a healthy 20 TPS.
            tickMs: tps > 0 ? 1000 / tps : 0,
            players: this.server.getSessionManager().getAllPlayers().length,
            maxPlayers: this.server.getConfig().getMaxPlayers(),
            rssBytes: process.memoryUsage().rss,
            uptimeMs: process.uptime() * 1000
        };

        const key = statusKey(status);
        const now = Date.now();
        if (key === this.lastStatusKey && now - this.lastStatusAt < this.statusKeepAliveMs) return;

        this.lastStatusKey = key;
        this.lastStatusAt = now;
        this.send(status);
    }

    private sendLifecycle(state: LifecycleState): void {
        this.lastLifecycle = state;
        this.send({ type: 'lifecycle', v: PROTOCOL_VERSION, state });
    }

    private send(message: ServerMessage): void {
        this.link.send(message);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms).unref();
        });
    }
}
