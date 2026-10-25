import { describe, expect, it, vi } from 'vitest';
import { memoryLinkPair } from './memoryLink';

type Ping = { type: 'ping'; n: number };
type Pong = { type: 'pong'; n: number };

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('memoryLinkPair', () => {
    it('delivers messages to the other end asynchronously, in order', async () => {
        const [left, right] = memoryLinkPair<Ping, Pong>();
        const seenByRight: Pong[] = [];
        const seenByLeft: Ping[] = [];
        right.onMessage((message) => seenByRight.push(message));
        left.onMessage((message) => seenByLeft.push(message));

        expect(left.send({ type: 'pong', n: 1 })).toBe(true);
        expect(left.send({ type: 'pong', n: 2 })).toBe(true);
        expect(right.send({ type: 'ping', n: 3 })).toBe(true);
        expect(seenByRight).toEqual([]);

        await settled();
        expect(seenByRight).toEqual([
            { type: 'pong', n: 1 },
            { type: 'pong', n: 2 }
        ]);
        expect(seenByLeft).toEqual([{ type: 'ping', n: 3 }]);
    });

    it('calls message listeners in registration order and honors unsubscribe', async () => {
        const [left, right] = memoryLinkPair<Ping, Pong>();
        const calls: string[] = [];
        const off = right.onMessage(() => calls.push('first'));
        right.onMessage(() => calls.push('second'));

        left.send({ type: 'pong', n: 1 });
        await settled();
        expect(calls).toEqual(['first', 'second']);

        off();
        left.send({ type: 'pong', n: 2 });
        await settled();
        expect(calls).toEqual(['first', 'second', 'second']);
    });

    it('closing one end closes both, once, and stops delivery', async () => {
        const [left, right] = memoryLinkPair<Ping, Pong>();
        const leftClosed = vi.fn();
        const rightClosed = vi.fn();
        const received = vi.fn();
        left.onClose(leftClosed);
        right.onClose(rightClosed);
        right.onMessage(received);

        left.send({ type: 'pong', n: 1 });
        right.close();
        right.close();
        left.close();

        expect(leftClosed).toHaveBeenCalledTimes(1);
        expect(rightClosed).toHaveBeenCalledTimes(1);
        expect(left.send({ type: 'pong', n: 2 })).toBe(false);

        await settled();
        expect(received).not.toHaveBeenCalled();
    });
});
