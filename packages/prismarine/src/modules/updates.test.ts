import { Kernel } from '@jsprismarine/kernel';
import { afterEach, describe, expect, it } from 'vitest';

import { feedOf, feedServer } from '../updates/feed.test-utils';
import { DEFAULT_UPDATE_SETTINGS, readUpdateSettings } from '../updates/settings';
import type { UpdateSettings } from '../updates/settings';
import { updatesToken } from './tokens';
import { FIRST_UPDATE_CHECK_DELAY_MS, UPDATE_NOTIFY_PERMISSION, updatesModule } from './updates';
import type { UpdateNoticeTarget } from './updates';

const RELEASE = 'https://jsprismarine.dev/updates/v1/release.json';

/**
 * A timer the test fires by hand, which records the delays it was asked for. The module sets the
 * next timer once a check has finished, so firing one waits for that.
 */
const manualTimer = () => {
    const pending: { callback: () => void; delayMs: number; cancelled: boolean }[] = [];
    let scheduled = Promise.withResolvers<void>();
    return {
        setTimer: (callback: () => void, delayMs: number) => {
            const entry = { callback, delayMs, cancelled: false };
            pending.push(entry);
            scheduled.resolve();
            return () => {
                entry.cancelled = true;
            };
        },
        delays: () => pending.filter((entry) => !entry.cancelled).map((entry) => entry.delayMs),
        /** Runs the oldest timer still waiting, and waits for the check it started to schedule the next. */
        fire: async () => {
            const next = pending.find((entry) => !entry.cancelled);
            if (next === undefined) throw new Error('no timer is waiting');
            next.cancelled = true;
            scheduled = Promise.withResolvers<void>();
            next.callback();
            await scheduled.promise;
        }
    };
};

const servers: { close: () => Promise<void> }[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
});

const playerOf = (permitted: boolean) => {
    const told: string[] = [];
    const player: UpdateNoticeTarget = {
        hasPermission: (node) => permitted && node === UPDATE_NOTIFY_PERMISSION,
        sendMessage: async (message) => {
            told.push(message);
        }
    };
    return { player, told };
};

const setUp = async ({
    settings = DEFAULT_UPDATE_SETTINGS,
    build = { version: '0.25.0', type: 'release' as const },
    files = { [RELEASE]: feedOf('0.26.0') }
}: {
    settings?: UpdateSettings;
    build?: { version: string; type?: 'release' | 'nightly' };
    files?: Record<string, unknown>;
} = {}) => {
    const timer = manualTimer();
    const server = await feedServer(files);
    servers.push(server);
    const op = playerOf(true);
    const guest = playerOf(false);
    const logged: string[] = [];
    const kernel = new Kernel({
        logger: {
            debug: () => undefined,
            info: (message) => logged.push(message),
            warn: (message) => logged.push(message),
            error: (message) => logged.push(message)
        }
    });
    kernel.register(
        updatesModule({
            settings: () => settings,
            players: () => [op.player, guest.player],
            env: {},
            build,
            fetch: server.fetch,
            setTimer: timer.setTimer,
            now: () => 0
        })
    );
    await kernel.start();
    return { kernel, timer, requests: server.requests, op, guest, logged, updates: kernel.get(updatesToken) };
};

describe('updatesModule', () => {
    it('checks a minute after the start and then every interval', async () => {
        const { timer, requests } = await setUp({ settings: readUpdateSettings({ interval: 120 }) });

        expect(timer.delays()).toEqual([FIRST_UPDATE_CHECK_DELAY_MS]);
        expect(requests).toHaveLength(0);

        await timer.fire();
        expect(requests).toHaveLength(1);
        expect(timer.delays()).toEqual([120 * 60_000]);

        await timer.fire();
        expect(requests).toHaveLength(2);
    });

    it('logs a new build once and tells only the players who hold the node', async () => {
        const { timer, op, guest, logged } = await setUp();

        await timer.fire();
        await timer.fire();

        expect(logged.filter((line) => line.includes('0.26.0 is out'))).toHaveLength(1);
        expect(op.told).toEqual([expect.stringContaining('JSPrismarine 0.26.0 is out')]);
        expect(guest.told).toEqual([]);
    });

    it('greets a player who joins after the check, when they hold the node', async () => {
        const { timer, updates } = await setUp();
        const before = playerOf(true);
        await updates.welcome(before.player);
        await timer.fire();
        const after = playerOf(true);
        const guest = playerOf(false);

        await updates.welcome(after.player);
        await updates.welcome(guest.player);

        expect(before.told).toEqual([]);
        expect(after.told).toEqual([expect.stringContaining('0.26.0')]);
        expect(guest.told).toEqual([]);
    });

    it('schedules nothing for a checkout, yet checks when asked', async () => {
        const { timer, requests, updates } = await setUp({ build: { version: '0.25.0' } });

        expect(timer.delays()).toEqual([]);
        expect(updates.status()).toMatchObject({ state: 'off' });

        await expect(updates.check()).resolves.toMatchObject({ state: 'available', update: { version: '0.26.0' } });
        expect(requests).toHaveLength(1);
    });

    it('stops checking when the kernel stops', async () => {
        const { kernel, timer } = await setUp();

        await kernel.stop();

        expect(timer.delays()).toEqual([]);
    });
});
