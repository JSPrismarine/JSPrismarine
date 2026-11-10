import dgram from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { conditionLink } from './LinkConditions';
import type { ConditionedLink } from './LinkConditions';

/** A receiving socket on loopback and what it got, in order. */
const receiver = async () => {
    const socket = dgram.createSocket('udp4');
    const received: string[] = [];
    socket.on('message', (message) => received.push(message.toString()));
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    return { socket, received, port: (socket.address() as AddressInfo).port };
};

/** Lets the event loop deliver datagrams already on loopback, without moving faked timers. */
const settleIo = async (turns = 20) => {
    for (let turn = 0; turn < turns; turn++) await nextTurn();
};

describe('conditionLink', () => {
    const open: { close(): void }[] = [];
    let link: ConditionedLink | undefined;

    afterEach(() => {
        link?.restore();
        link = undefined;
        for (const socket of open.splice(0)) socket.close();
        vi.useRealTimers();
    });

    it('holds each datagram for the latency, then sends it', async () => {
        const { socket, received, port } = await receiver();
        const sender = dgram.createSocket('udp4');
        open.push(socket, sender);
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        link = conditionLink({ latencyMs: 150 });

        sender.send('one', port, '127.0.0.1');
        await vi.advanceTimersByTimeAsync(149);
        await settleIo();
        expect(received).toStrictEqual([]);

        await vi.advanceTimersByTimeAsync(1);
        await vi.waitFor(() => expect(received).toStrictEqual(['one']));
    });

    it('drops the datagrams the random source picks, and counts them', async () => {
        const { socket, received, port } = await receiver();
        const sender = dgram.createSocket('udp4');
        open.push(socket, sender);
        const picks = [0.9, 0.1, 0.9, 0.1, 0.9];
        link = conditionLink({ loss: 0.5, random: () => picks.shift() ?? 1 });

        for (const word of ['a', 'b', 'c', 'd', 'e']) sender.send(word, port, '127.0.0.1');

        // UDP keeps no order, and a socket's first send binds it, so compare what arrived.
        await vi.waitFor(() => expect(received.toSorted()).toStrictEqual(['a', 'c', 'e']));
        expect([link.sent, link.dropped]).toStrictEqual([5, 2]);
    });

    it('tells the sender a dropped datagram went, as UDP would', async () => {
        const sender = dgram.createSocket('udp4');
        open.push(sender);
        link = conditionLink({ loss: 1 });

        const error = await new Promise<Error | null>((resolve) => sender.send('lost', 9, '127.0.0.1', resolve));

        expect(error).toBeNull();
    });

    it('sends directly again once restored', async () => {
        const send = dgram.Socket.prototype.send;
        link = conditionLink({ latencyMs: 10 });

        link.restore();

        expect(dgram.Socket.prototype.send).toBe(send);
    });

    it('refuses a second link and impossible conditions', () => {
        link = conditionLink({});

        expect(() => conditionLink({})).toThrow('already sending');
        link.restore();
        expect(() => conditionLink({ latencyMs: -1 })).toThrow(RangeError);
        expect(() => conditionLink({ loss: 1.5 })).toThrow(RangeError);
    });
});
