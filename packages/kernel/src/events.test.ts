import { describe, expect, it, vi } from 'vitest';

import { KernelEventBus } from './events';

interface TestEvents {
    tick: [count: number];
    chat: [sender: string, message: string];
    [event: string]: readonly unknown[];
}

describe('KernelEventBus', () => {
    it('awaits async listeners in subscription order', async () => {
        const bus = new KernelEventBus<TestEvents>();
        const order: string[] = [];
        bus.on('tick', async (count) => {
            await Promise.resolve();
            order.push(`slow:${count}`);
        });
        bus.on('tick', (count) => {
            order.push(`fast:${count}`);
        });
        await bus.emit('tick', 7);

        expect(order).toStrictEqual(['slow:7', 'fast:7']);
    });

    it('removes a single subscription through its unsubscribe function', async () => {
        const bus = new KernelEventBus<TestEvents>();
        const received: string[] = [];
        const unsubscribe = bus.on('chat', (sender, message) => {
            received.push(`${sender}: ${message}`);
        });
        await bus.emit('chat', 'steve', 'hi');
        unsubscribe();
        await bus.emit('chat', 'steve', 'anyone?');

        expect(received).toStrictEqual(['steve: hi']);
    });

    it('removes only the matching scope, keeping other listeners attached', async () => {
        const bus = new KernelEventBus<TestEvents>();
        const received: string[] = [];
        bus.scoped('mod-a').on('tick', (count) => {
            received.push(`a:${count}`);
        });
        bus.scoped('mod-b').on('tick', (count) => {
            received.push(`b:${count}`);
        });
        bus.removeScope('mod-a');
        await bus.emit('tick', 1);

        expect(received).toStrictEqual(['b:1']);
    });

    it('posts to every listener in subscription order and waits for none', () => {
        const bus = new KernelEventBus<TestEvents>();
        const order: string[] = [];
        bus.on('tick', async (count) => {
            order.push(`first:${count}`);
            await Promise.resolve();
            order.push(`first after its wait:${count}`);
        });
        bus.on('tick', (count) => {
            order.push(`second:${count}`);
        });

        expect(bus.post('tick', 3)).toBe(2);
        expect(order).toStrictEqual(['first:3', 'second:3']);
    });

    it('reports a listener that throws or rejects and still calls the ones after it', async () => {
        const failures: { error: unknown; event: string }[] = [];
        const bus = new KernelEventBus<TestEvents>({
            onListenerError: (error, event) => failures.push({ error, event })
        });
        const thrown = new Error('thrown');
        const rejected = new Error('rejected');
        const calls: string[] = [];
        bus.on('tick', () => {
            calls.push('throws');
            throw thrown;
        });
        bus.on('tick', async () => {
            calls.push('rejects');
            throw rejected;
        });
        bus.on('tick', () => {
            calls.push('last');
        });

        expect(bus.post('tick', 1)).toBe(3);
        expect(calls).toStrictEqual(['throws', 'rejects', 'last']);
        await vi.waitFor(() => expect(failures).toHaveLength(2));
        expect(failures).toStrictEqual([
            { error: thrown, event: 'tick' },
            { error: rejected, event: 'tick' }
        ]);

        calls.length = 0;
        failures.length = 0;
        await expect(bus.emit('tick', 2)).resolves.toBeUndefined();
        expect(calls).toStrictEqual(['throws', 'rejects', 'last']);
        expect(failures).toStrictEqual([
            { error: thrown, event: 'tick' },
            { error: rejected, event: 'tick' }
        ]);
    });

    it('reports the rejection of a thenable that is not a native promise', async () => {
        const failures: unknown[] = [];
        const bus = new KernelEventBus<TestEvents>({ onListenerError: (error) => failures.push(error) });
        const rejected = new Error('rejected elsewhere');
        // What a promise from another realm or library looks like to the bus: a `then` alone.
        const foreign: PromiseLike<never> = {
            then: (_resolve, reject) => {
                reject?.(rejected);
                return foreign;
            }
        };
        bus.on('tick', () => foreign);

        expect(bus.post('tick', 1)).toBe(1);
        await vi.waitFor(() => expect(failures).toStrictEqual([rejected]));
    });

    it('reports a returned value whose then getter throws, and calls the listeners after it', () => {
        const failures: unknown[] = [];
        const bus = new KernelEventBus<TestEvents>({ onListenerError: (error) => failures.push(error) });
        const broken = new Error('broken then');
        const calls: string[] = [];
        bus.on('tick', () => {
            calls.push('first');
            return {
                get then(): never {
                    throw broken;
                }
            };
        });
        bus.on('tick', () => void calls.push('second'));

        expect(bus.post('tick', 1)).toBe(2);
        expect(calls).toStrictEqual(['first', 'second']);
        expect(failures).toStrictEqual([broken]);
    });

    it('keeps calling listeners when the error handler throws', async () => {
        const bus = new KernelEventBus<TestEvents>({
            onListenerError: () => {
                throw new Error('the reporter failed');
            }
        });
        const calls: string[] = [];
        bus.on('tick', () => {
            calls.push('throws');
            throw new Error('the listener failed');
        });
        bus.on('tick', () => {
            calls.push('last');
        });

        expect(bus.post('tick', 1)).toBe(2);
        expect(calls).toStrictEqual(['throws', 'last']);
        await expect(bus.emit('tick', 2)).resolves.toBeUndefined();
        expect(calls).toStrictEqual(['throws', 'last', 'throws', 'last']);
    });

    it('lets a listener cancel what raised the event, and the later listeners see the cancel', () => {
        const bus = new KernelEventBus<{ move: [event: { canceled: boolean }] }>();
        const seen: boolean[] = [];
        bus.on('move', (event) => {
            event.canceled = true;
        });
        bus.on('move', (event) => {
            seen.push(event.canceled);
        });
        const event = { canceled: false };
        bus.post('move', event);

        expect(event.canceled).toBe(true);
        expect(seen).toStrictEqual([true]);
    });

    it('calls a once listener for the next event only', async () => {
        const bus = new KernelEventBus<TestEvents>();
        const received: number[] = [];
        bus.once('tick', (count) => {
            received.push(count);
            // A listener that raises its own event is not called again.
            bus.post('tick', count + 100);
        });
        bus.post('tick', 1);
        await bus.emit('tick', 2);

        expect(received).toStrictEqual([1]);
        expect(bus.hasListeners('tick')).toBe(false);
    });

    it('subscribes the same function once and removes it by identity', () => {
        const bus = new KernelEventBus<TestEvents>();
        let calls = 0;
        const listener = (): void => {
            calls++;
        };
        bus.on('tick', listener);
        bus.on('tick', listener);
        expect(bus.post('tick', 1)).toBe(1);

        bus.off('tick', listener);
        expect(bus.hasListeners('tick')).toBe(false);
        expect(bus.post('tick', 2)).toBe(0);
        expect(calls).toBe(1);
    });

    it.each([
        ['once then on', 'once', 'on'],
        ['on then once', 'on', 'once']
    ] as const)('keeps the function subscribed after %s', (_order, first, second) => {
        const bus = new KernelEventBus<TestEvents>();
        let calls = 0;
        const listener = (): void => {
            calls++;
        };
        bus[first]('tick', listener);
        bus[second]('tick', listener);

        expect(bus.post('tick', 1)).toBe(1);
        expect(bus.post('tick', 2)).toBe(1);
        expect(calls).toBe(2);
        expect(bus.hasListeners('tick')).toBe(true);
    });

    it.each([
        ['once then on', 'once', 'on'],
        ['on then once', 'on', 'once']
    ] as const)('removes the function with one off after %s', (_order, first, second) => {
        const bus = new KernelEventBus<TestEvents>();
        let calls = 0;
        const listener = (): void => {
            calls++;
        };
        bus[first]('tick', listener);
        bus[second]('tick', listener);
        bus.off('tick', listener);

        expect(bus.hasListeners('tick')).toBe(false);
        expect(bus.post('tick', 1)).toBe(0);
        expect(bus.post('tick', 2)).toBe(0);
        expect(calls).toBe(0);
    });

    it('removes all of one handle and keeps the others', () => {
        const bus = new KernelEventBus<TestEvents>();
        const received: string[] = [];
        bus.on('tick', () => {
            received.push('unscoped');
        });
        const module = bus.scoped('mod');
        module.on('tick', () => {
            received.push('scoped');
        });
        bus.removeAll();
        bus.post('tick', 1);
        module.removeAll('tick');
        bus.post('tick', 2);

        expect(received).toStrictEqual(['scoped']);
    });
});
