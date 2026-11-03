import type { RemoteInfo } from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from './RakNetPeer';
import { RAKNET_TICK_INTERVAL_MS, RTO_MAX_MS, SESSION_TIMEOUT_MS } from './Constants';
import type RakNetSession from './Session';
import ClientSocket from './ClientSocket';

const stub = <T extends object>(members: Partial<Omit<T, 'constructor'>> = {}): T =>
    Object.assign(Object.create(Object.prototype), members);

const remote: RemoteInfo = { address: '127.0.0.1', port: 19132, family: 'IPv4', size: 4 };

const stalledSessionState = (stallDurationMs: number) => {
    const lastActivityBeforeStall = performance.now() - stallDurationMs;
    const retransmissionDeadline = lastActivityBeforeStall + RTO_MAX_MS;
    let lastActivity = lastActivityBeforeStall;
    let ackPending = true;
    let retransmissions = 0;
    let timeouts = 0;
    const events: string[] = [];
    const session = stub<RakNetSession>({
        rinfo: remote,
        handle: () => {
            events.push('handle');
            lastActivity = performance.now();
            ackPending = false;
        },
        update: (now: number) => {
            events.push('update');
            if (now - lastActivity > SESSION_TIMEOUT_MS) timeouts++;
            if (ackPending && now >= retransmissionDeadline) retransmissions++;
        },
        sendConnectedPing: () => {}
    });

    return {
        session,
        events,
        get retransmissions() {
            return retransmissions;
        },
        get timeouts() {
            return timeouts;
        }
    };
};

const logger = stub<Logger>({ error: () => {}, debug: () => {}, verbose: () => {}, warn: () => {} });

describe('ClientSocket tick ordering', () => {
    afterEach(() => vi.useRealTimers());

    it('processes an ACK queued during a retransmission stall before session updates', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
        const client = new ClientSocket(logger);
        const state = stalledSessionState(RTO_MAX_MS + 1);
        client['session'] = state.session;
        client['socket'].on('message', client['handleMessage']);
        client['startTicking']();

        vi.advanceTimersByTime(RAKNET_TICK_INTERVAL_MS);
        client['socket'].emit('message', Buffer.from([0xc0, 0, 0, 0]), remote);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(state.events[0]).toBe('handle');
        expect(state.events).toContain('update');
        expect(state.retransmissions).toBe(0);

        client['stopped'] = true;
        clearTimeout(client['ticker']);
    });

    it('refreshes client activity before timeout checks after a long stall', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
        const client = new ClientSocket(logger);
        const state = stalledSessionState(SESSION_TIMEOUT_MS + 1);
        client['session'] = state.session;
        client['socket'].on('message', client['handleMessage']);
        client['startTicking']();

        vi.advanceTimersByTime(RAKNET_TICK_INTERVAL_MS);
        client['socket'].emit('message', Buffer.from([0xc0, 0, 0, 0]), remote);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(state.events[0]).toBe('handle');
        expect(state.events).toContain('update');
        expect(state.timeouts).toBe(0);

        client['stopped'] = true;
        clearTimeout(client['ticker']);
    });
});
