import { EventEmitter } from 'node:events';
import type { MessageLink } from './link';

type EndEvents<In> = { message: [In]; close: [] };

/**
 * Two in-memory {@link MessageLink}s wired to each other, for tests that need a server and a
 * console in one process. Messages are delivered on a microtask, so `send` returns before any
 * listener runs, as with a real channel. `close()` on either end runs the close listeners of
 * both ends synchronously; messages still queued at that moment are dropped.
 *
 * @returns A tuple of the end that receives `A` and sends `B`, and the end that receives `B`
 * and sends `A`.
 */
export function memoryLinkPair<A, B>(): [MessageLink<A, B>, MessageLink<B, A>] {
    const a = new EventEmitter<EndEvents<A>>();
    const b = new EventEmitter<EndEvents<B>>();
    let open = true;

    const close = (): void => {
        if (!open) return;
        open = false;
        a.emit('close');
        b.emit('close');
        a.removeAllListeners();
        b.removeAllListeners();
    };

    const end = <In, Out>(
        mine: EventEmitter<EndEvents<In>>,
        peer: EventEmitter<EndEvents<Out>>
    ): MessageLink<In, Out> => ({
        send(message) {
            if (!open) return false;
            queueMicrotask(() => {
                if (open) peer.emit('message', message);
            });
            return true;
        },
        onMessage(listener) {
            mine.on('message', listener);
            return () => {
                mine.off('message', listener);
            };
        },
        onClose(listener) {
            mine.on('close', listener);
            return () => {
                mine.off('close', listener);
            };
        },
        close
    });

    return [end<A, B>(a, b), end<B, A>(b, a)];
}
