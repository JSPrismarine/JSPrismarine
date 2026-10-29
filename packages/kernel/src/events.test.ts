import { describe, expect, it } from 'vitest';

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
});
