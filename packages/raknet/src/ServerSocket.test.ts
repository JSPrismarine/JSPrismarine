import { afterEach, describe, expect, it, vi } from 'vitest';
import { RAKNET_TICK_INTERVAL_MS } from './Constants';
import ServerSocket from './ServerSocket';
import { ServerName } from './utils/ServerName';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };
const serverName = new ServerName({
    getConfig: () => ({ getMotd: () => 'x', getGamemode: () => 'survival', getMaxPlayers: () => 10 }),
    getIdentifiers: () => ({ Protocol: 0, MinecraftVersions: ['0.0.0'] })
});

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
});
