import { afterEach, describe, expect, it, vi } from 'vitest';
import { RAKNET_TICK_INTERVAL_MS } from './Constants';
import ServerSocket from './ServerSocket';

describe('ServerSocket', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('stops the ticker when killed after a tick has run', () => {
        // Only the timers the ticker uses: `kill` hands the socket close to a `setImmediate`,
        // which a faked `setImmediate` would otherwise leave counted as a pending timer.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

        const server = new ServerSocket(1, false, { setOnlinePlayerCount: vi.fn() }, {} as any);
        server.start('127.0.0.1', 0);

        vi.advanceTimersByTime(RAKNET_TICK_INTERVAL_MS);
        server.kill();

        expect(vi.getTimerCount()).toBe(0);
    });
});
