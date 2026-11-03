import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RemoteInfo } from 'node:dgram';
import { RAKNET_TICK_INTERVAL_MS, RTO_MAX_MS, SESSION_TIMEOUT_MS } from './Constants';
import type RakNetSession from './Session';
import ServerSocket from './ServerSocket';
import { ServerName } from './utils/ServerName';

const stub = <T extends object>(members: Partial<Omit<T, 'constructor'>> = {}): T =>
    Object.assign(Object.create(Object.prototype), members);

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };
const serverName = new ServerName(
    {
        getConfig: () => ({ getMotd: () => 'x', getGamemode: () => 'survival', getMaxPlayers: () => 10 })
    },
    { protocolVersion: 0, minecraftVersions: ['0.0.0'] }
);

describe('ServerSocket', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('stops the ticker when killed after a tick has run', () => {
        // Only the timers the ticker uses: `kill` hands the socket close to a `setImmediate`,
        // which a faked `setImmediate` would otherwise leave counted as a pending timer.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

        const server = new ServerSocket(1, false, serverName, logger);
        server.start('127.0.0.1', 0);

        vi.advanceTimersByTime(RAKNET_TICK_INTERVAL_MS);
        server.kill();

        expect(vi.getTimerCount()).toBe(0);
    });

    it('processes an ACK queued during a retransmission stall before session updates', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
        const server = new ServerSocket(1, false, serverName, logger);
        const remote: RemoteInfo = { address: '127.0.0.1', port: 19132, family: 'IPv4', size: 4 };
        const state = stalledSessionState(RTO_MAX_MS + 1);
        server['sessions'].set('127.0.0.1:19132', state.session);
        const listening = new Promise<void>((resolve) => server['socket'].once('listening', resolve));
        server.start('127.0.0.1', 0);
        await listening;

        vi.advanceTimersByTime(RAKNET_TICK_INTERVAL_MS);
        server['socket'].emit('message', Buffer.from([0xc0, 0, 0, 0]), remote);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(state.events[0]).toBe('handle');
        expect(state.events).toContain('update');
        expect(state.retransmissions).toBe(0);

        server['sessions'].clear();
        server.kill();
        await new Promise<void>((resolve) => setImmediate(resolve));
    });

    it('refreshes session activity before timeout checks after a long stall', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
        const server = new ServerSocket(1, false, serverName, logger);
        const remote: RemoteInfo = { address: '127.0.0.1', port: 19132, family: 'IPv4', size: 4 };
        const state = stalledSessionState(SESSION_TIMEOUT_MS + 1);
        server['sessions'].set('127.0.0.1:19132', state.session);
        const listening = new Promise<void>((resolve) => server['socket'].once('listening', resolve));
        server.start('127.0.0.1', 0);
        await listening;

        vi.advanceTimersByTime(RAKNET_TICK_INTERVAL_MS);
        server['socket'].emit('message', Buffer.from([0xc0, 0, 0, 0]), remote);
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(state.events[0]).toBe('handle');
        expect(state.events).toContain('update');
        expect(state.timeouts).toBe(0);

        server['sessions'].clear();
        server.kill();
        await new Promise<void>((resolve) => setImmediate(resolve));
    });
});

const stalledSessionState = (stallDurationMs: number) => {
    const lastActivityBeforeStall = performance.now() - stallDurationMs;
    const retransmissionDeadline = lastActivityBeforeStall + RTO_MAX_MS;
    let lastActivity = lastActivityBeforeStall;
    let ackPending = true;
    let retransmissions = 0;
    let timeouts = 0;
    const events: string[] = [];
    const remote: RemoteInfo = { address: '127.0.0.1', port: 19132, family: 'IPv4', size: 4 };
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
        }
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
