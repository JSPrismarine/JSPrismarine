import { describe, expect, it } from 'vitest';

import { KeepAlive } from './KeepAlive';

/** A keep-alive on a timer the test fires by hand, recording what it does. */
const keepAlive = (intervalMs = 15_000) => {
    const did: string[] = [];
    let fire: (() => void) | undefined;
    let next = 0n;
    const pings = new KeepAlive({
        intervalMs,
        ping: (id) => void did.push(`ping ${id}`),
        timedOut: () => void did.push('timed out'),
        idOf: () => ++next,
        timer: (run) => {
            fire = run;
            return () => {
                fire = undefined;
                did.push('stopped');
            };
        }
    });
    return { did, pings, tick: () => fire?.() };
};

describe('KeepAlive', () => {
    it('pings each interval while the client answers', () => {
        const { did, pings, tick } = keepAlive();

        pings.start();
        tick();
        pings.answered(1n);
        tick();

        expect(did).toEqual(['ping 1', 'ping 2']);
    });

    it('disconnects a client that leaves a ping unanswered until the next is due, and stops', () => {
        const { did, pings, tick } = keepAlive();

        pings.start();
        tick();
        tick();
        tick();

        expect(did).toEqual(['ping 1', 'stopped', 'timed out']);
    });

    it('takes an answer only for the ping it names, or any answer when it names none', () => {
        const { did, pings, tick } = keepAlive();

        pings.start();
        tick();
        pings.answered(9n);
        tick();

        expect(did).toEqual(['ping 1', 'stopped', 'timed out']);

        const other = keepAlive();
        other.pings.start();
        other.tick();
        other.pings.answered();
        other.tick();

        expect(other.did).toEqual(['ping 1', 'ping 2']);
    });

    it('sends nothing for an interval of 0', () => {
        const { did, pings, tick } = keepAlive(0);

        pings.start();
        tick();

        expect(did).toEqual([]);
    });
});
