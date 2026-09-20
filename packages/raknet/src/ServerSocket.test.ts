import { afterEach, describe, expect, it, vi } from 'vitest';
import { RAKNET_TPS } from './Constants';
import ServerSocket from './ServerSocket';

describe('ServerSocket', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('stops the ticker when killed after a tick has run', () => {
        vi.useFakeTimers();

        const server = new ServerSocket(1, false, { setOnlinePlayerCount: vi.fn() }, {} as any);
        server.start('127.0.0.1', 0);

        vi.advanceTimersByTime(1000 / RAKNET_TPS);
        server.kill();

        expect(vi.getTimerCount()).toBe(0);
    });
});
