import { EventEmitter } from 'node:events';
import type { LinkOptions, MessageLink } from './link';

/**
 * The parts of `process` the server-side link uses. `process` satisfies it when Node started
 * the process with an `'ipc'` stdio entry; tests can pass a double.
 */
export interface IpcProcess {
    connected: boolean;
    send?(message: unknown, sendHandle?: unknown, options?: unknown, callback?: (error: Error | null) => void): boolean;
    disconnect?(): void;
    on(event: 'message', listener: (message: unknown) => void): unknown;
    on(event: 'disconnect', listener: () => void): unknown;
    off(event: 'message', listener: (message: unknown) => void): unknown;
    off(event: 'disconnect', listener: () => void): unknown;
}

/** Options for {@link childProcessLink}. */
export interface ChildProcessLinkOptions<In> extends LinkOptions<In> {
    /** The process whose IPC channel carries the messages. Defaults to the current `process`. */
    proc?: IpcProcess;
}

/**
 * A {@link MessageLink} over the IPC channel of the current process, with a `flush` for the
 * shutdown path: Node discards IPC writes still queued when `process.exit` runs, so the server
 * awaits `flush()` before exiting to get its last messages out.
 */
export interface ChildProcessLink<In, Out> extends MessageLink<In, Out> {
    /** Resolves once Node has written every message queued so far to the channel, or once the channel has closed. */
    flush(): Promise<void>;
}

/**
 * Builds the server-side link over the IPC channel Node opens when the host forks the server
 * with an `'ipc'` stdio entry. Messages travel through `process.send` in Node's JSON mode, so
 * they must be plain JSON values. Registering a message listener makes the channel keep the
 * process alive until it disconnects.
 *
 * `send` returns what `process.send` returns: `false` once the unsent backlog passes Node's
 * threshold or after the channel closed. The close listeners run when the channel disconnects,
 * whether through {@link MessageLink.close} or because the host went away. A channel that is
 * already disconnected when the link is built, because the host went away during startup, is
 * reported the same way: the close listeners run on the next microtask, which leaves the
 * caller its synchronous turn to register them, so the server still learns to shut down.
 *
 * @throws {Error} When the process has no IPC channel, which means it was not started by
 * `child_process.fork` or with an `'ipc'` stdio entry.
 */
export function childProcessLink<In, Out>(options: ChildProcessLinkOptions<In>): ChildProcessLink<In, Out> {
    const { validate, proc = process } = options;
    if (typeof proc.send !== 'function') {
        throw new Error(
            'childProcessLink needs an IPC channel; start the process with child_process.fork or a stdio entry of "ipc".'
        );
    }
    const ipcSend = proc.send.bind(proc);
    const events = new EventEmitter<{ message: [In]; close: [] }>();
    let open = proc.connected;
    let pending = 0;
    let drained: Array<() => void> = [];

    const settle = (): void => {
        if (pending !== 0) return;
        const waiters = drained;
        drained = [];
        for (const resolve of waiters) resolve();
    };

    const onIpcMessage = (value: unknown): void => {
        if (validate(value)) events.emit('message', value);
    };

    const onDisconnect = (): void => {
        if (!open) return;
        open = false;
        proc.off('message', onIpcMessage);
        proc.off('disconnect', onDisconnect);
        pending = 0;
        settle();
        events.emit('close');
        events.removeAllListeners();
    };

    if (open) {
        proc.on('message', onIpcMessage);
        proc.on('disconnect', onDisconnect);
    } else {
        // Born closed. No 'disconnect' will ever fire, so report the close ourselves, deferred
        // one microtask so the listeners the caller registers right after this return still run.
        queueMicrotask(() => {
            events.emit('close');
            events.removeAllListeners();
        });
    }

    return {
        send(message) {
            if (!open || !proc.connected) return false;
            pending += 1;
            return ipcSend(message, undefined, undefined, () => {
                // A failed write means the channel is going away; 'disconnect' follows and
                // closes the link, so the error itself needs no separate handling here.
                pending = Math.max(0, pending - 1);
                settle();
            });
        },
        onMessage(listener) {
            events.on('message', listener);
            return () => {
                events.off('message', listener);
            };
        },
        onClose(listener) {
            events.on('close', listener);
            return () => {
                events.off('close', listener);
            };
        },
        close() {
            if (!open) return;
            if (proc.connected && typeof proc.disconnect === 'function') proc.disconnect();
            else onDisconnect();
        },
        flush() {
            if (pending === 0) return Promise.resolve();
            return new Promise((resolve) => {
                drained.push(resolve);
            });
        }
    };
}
