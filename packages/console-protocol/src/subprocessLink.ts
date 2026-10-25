import type { ChildProcess, Serializable } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { LinkOptions, MessageLink } from './link';

/**
 * Builds the host-side link to a server child spawned with an `'ipc'` stdio entry. Messages
 * travel through `child.send`, and incoming ones pass `options.validate` before any listener
 * sees them, so a stray JSON value from the child is dropped rather than thrown.
 *
 * The link closes when the child exits or its channel disconnects; `stopped` versus `crashed`
 * is for the caller to derive from the child's `'exit'` event. {@link MessageLink.close}
 * disconnects the channel but leaves the child running; stopping it is the supervisor's job.
 */
export function subprocessLink<In, Out extends Serializable>(
    child: ChildProcess,
    options: LinkOptions<In>
): MessageLink<In, Out> {
    const { validate } = options;
    const events = new EventEmitter<{ message: [In]; close: [] }>();
    let open = child.connected;

    const onIpcMessage = (value: unknown): void => {
        if (validate(value)) events.emit('message', value);
    };

    const onGone = (): void => {
        if (!open) return;
        open = false;
        child.off('message', onIpcMessage);
        child.off('exit', onGone);
        child.off('disconnect', onGone);
        events.emit('close');
        events.removeAllListeners();
    };

    if (open) {
        child.on('message', onIpcMessage);
        child.on('exit', onGone);
        child.on('disconnect', onGone);
    }

    return {
        send(message) {
            if (!open || !child.connected) return false;
            // The callback keeps a failed write from surfacing as an 'error' event on the
            // child; the channel disconnects right after, which closes the link.
            return child.send(message, () => {});
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
            if (child.connected) child.disconnect();
            else onGone();
        }
    };
}
