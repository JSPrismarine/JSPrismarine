import type { ConsoleMessage, MessageLink, ServerMessage } from '@jsprismarine/console-protocol';
import { PROTOCOL_VERSION } from '@jsprismarine/console-protocol';
import type { LogLevel, LogRecord, LogTransport } from '@jsprismarine/logger';

const LEVEL_WEIGHT: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5 };

/**
 * A {@link MessageLink} that may also report when its unsent backlog has drained.
 *
 * `childProcessLink` has `flush`; `memoryLinkPair` does not. The transport uses it as the
 * resume signal after a paused `send` and polls on a timer when it is missing.
 */
export type FlushableLink<In, Out> = MessageLink<In, Out> & { flush?(): Promise<void> };

/** Options for {@link RemoteLogTransport}. */
export interface RemoteLogTransportOptions {
    /**
     * Most records held while the link asks for a pause; defaults to 5000. When the queue
     * is full the oldest record is dropped and counted.
     */
    capacity?: number;
    /**
     * How long to wait before retrying a paused link that offers no drain signal, in
     * milliseconds; defaults to 20.
     */
    retryMs?: number;
}

/**
 * Forwards log records to the console process as `log` messages.
 *
 * Every record the logger emits at or above the subscribed level becomes one message with a
 * `seq` that increases by one, so the console can detect a gap. While the link reports a
 * pause (`send` returned `false`) records queue up to the capacity; the oldest fall off and
 * are counted. Once the link drains, a single `log.dropped` with that count goes out before
 * the queued records resume, so the console knows where the hole is.
 */
export class RemoteLogTransport implements LogTransport {
    private readonly capacity: number;
    private readonly retryMs: number;
    private minLevel: LogLevel = 'silly';
    private seq = 0;
    private paused = false;
    private closed = false;
    private queue: ServerMessage[] = [];
    private droppedCount = 0;
    private retryTimer: NodeJS.Timeout | undefined;

    /**
     * @param link - The server end of the console link.
     * @param options - Queue capacity and retry delay.
     */
    public constructor(
        private readonly link: FlushableLink<ConsoleMessage, ServerMessage>,
        options: RemoteLogTransportOptions = {}
    ) {
        this.capacity = options.capacity ?? 5000;
        this.retryMs = options.retryMs ?? 20;
    }

    /** Records dropped from the queue and not yet announced with a `log.dropped` message. */
    public get dropped(): number {
        return this.droppedCount;
    }

    /** Records waiting for the link to drain. */
    public get pending(): number {
        return this.queue.length;
    }

    /**
     * Sets the least severe level still forwarded. Records below it are skipped and consume
     * no `seq`. Defaults to `silly`, which forwards everything the logger emits.
     */
    public setLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    /**
     * Forwards the record, or queues it while the link is paused. Records logged after
     * {@link close} are ignored.
     */
    public log(record: LogRecord): void {
        if (this.closed || LEVEL_WEIGHT[record.level] > LEVEL_WEIGHT[this.minLevel]) return;

        this.seq += 1;
        const message: ServerMessage = {
            type: 'log',
            v: PROTOCOL_VERSION,
            seq: this.seq,
            level: record.level,
            namespace: record.namespace,
            at: Date.now(),
            message: record.message,
            formatted: record.formatted
        };

        if (this.paused) {
            this.enqueue(message);
            return;
        }
        this.send(message);
    }

    /**
     * Hands every queued record to the link at once, with the pending `log.dropped` first,
     * and stops accepting records. The link queues them itself even while it reports a
     * pause, so nothing here is lost; whether they reach the other end before the process
     * exits is up to the link's `flush`.
     */
    public close(): void {
        if (this.closed) return;
        this.closed = true;
        this.stopRetry();

        const queued = this.queue;
        this.queue = [];
        this.announceDropped();
        for (const message of queued) this.link.send(message);
    }

    private enqueue(message: ServerMessage): void {
        if (this.queue.length >= this.capacity) {
            this.queue.shift();
            this.droppedCount += 1;
        }
        this.queue.push(message);
    }

    /** Sends one message and enters the paused state when the link asks for one. */
    private send(message: ServerMessage): void {
        if (this.link.send(message)) return;
        this.paused = true;
        this.scheduleResume();
    }

    private announceDropped(): void {
        if (this.droppedCount === 0) return;
        const count = this.droppedCount;
        this.droppedCount = 0;
        this.link.send({ type: 'log.dropped', v: PROTOCOL_VERSION, count });
    }

    private scheduleResume(): void {
        if (this.closed) return;
        if (this.link.flush) {
            void this.link.flush().then(() => this.resume());
            return;
        }
        this.retryTimer = setTimeout(() => this.resume(), this.retryMs);
        this.retryTimer.unref();
    }

    /**
     * Leaves the paused state and drains the queue until it is empty or the link pauses
     * again. The dropped count is announced before the first record that follows the hole.
     */
    private resume(): void {
        this.retryTimer = undefined;
        if (this.closed) return;
        this.paused = false;
        this.announceDropped();

        while (!this.paused && this.queue.length > 0) {
            const message = this.queue.shift();
            if (message) this.send(message);
        }
    }

    private stopRetry(): void {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
    }
}
