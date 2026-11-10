import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferred, ManualTransport, settle } from '../../testing/manualTransport.test.helper';

describe('network/transport/BaseTransport', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('runs every listener of a subscription in order, each awaited', async () => {
        const transport = new ManualTransport();
        const order: string[] = [];
        const first = deferred();
        transport.onFrame(async (payload) => {
            await first.promise;
            order.push(`first ${payload.toString()}`);
        });
        transport.onFrame((payload) => void order.push(`second ${payload.toString()}`));

        transport.connect('a');
        transport.frame('a', 'x');
        await settle();
        expect(order).toStrictEqual([]);

        first.resolve();
        await settle();
        expect(order).toStrictEqual(['first x', 'second x']);
    });

    it('holds a connection behind its own earlier events but not behind another connection', async () => {
        const transport = new ManualTransport();
        const order: string[] = [];
        const slowConnect = deferred();
        transport.onConnect(async (connection) => {
            if (connection.id === 1) await slowConnect.promise;
            order.push(`connect ${connection.id}`);
        });
        transport.onFrame((payload, id) => void order.push(`frame ${id} ${payload.toString()}`));
        transport.onDisconnect((id, _address, reason) => void order.push(`disconnect ${id} ${reason}`));

        transport.connect('a');
        transport.frame('a', 'x');
        transport.disconnect('a', 'gone');
        transport.connect('b');
        await settle();
        expect(order).toStrictEqual(['connect 2']);

        slowConnect.resolve();
        await settle();
        expect(order).toStrictEqual(['connect 2', 'connect 1', 'frame 1 x', 'disconnect 1 gone']);
    });

    it('keeps delivering to a connection after one of its deliveries fails, and rethrows the failure', async () => {
        const rethrown: (() => void)[] = [];
        vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => void rethrown.push(callback));
        const transport = new ManualTransport();
        const frames: string[] = [];
        transport.onFrame((payload) => {
            if (payload.toString() === 'bad') throw new Error('listener failed');
            frames.push(payload.toString());
        });

        transport.connect('a');
        transport.frame('a', 'bad');
        transport.frame('a', 'good');
        await settle();

        expect(frames).toStrictEqual(['good']);
        expect(rethrown).toHaveLength(1);
        expect(() => rethrown[0]!()).toThrow('listener failed');
    });
});
