import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// A reused worker may have loaded the real server dependencies before this file's mocks.
vi.hoisted(() => vi.resetModules());

import { Logger } from '@jsprismarine/logger';
import Server from './Server';
import { Config } from './config/Config';

vi.mock('@jsprismarine/raknet', async (importActual) => {
    const MockRakNetListener = vi.fn(function (this: any) {
        this.start = vi.fn();
        this.on = vi.fn();
        this.kill = vi.fn();
    });
    return {
        ...(await importActual<typeof import('@jsprismarine/raknet')>()),
        RakNetListener: MockRakNetListener
    };
});

describe('Server', () => {
    let worldRoot: string;

    beforeAll(() => {
        // This used to configure no world at all, which only booted because a missing
        // default world was warned about and shrugged off - leaving `getDefaultWorld()`
        // undefined and every caller asserting it away. It now fails at startup instead, so
        // the smoke test loads a real world. Pointed at a temp directory via `JSP_DIR` so
        // the run writes nothing into the repository.
        worldRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-server-test-'));
        vi.stubEnv('JSP_DIR', worldRoot);
    });

    afterAll(() => {
        vi.unstubAllEnvs();
        rmSync(worldRoot, { recursive: true, force: true });
    });

    /**
     * A config naming a world of its own.
     *
     * Extends the real `Config` because its fields are private, so nothing else can stand in
     * for it. `enable` is a no-op so the file under `JSP_DIR` is never read; every value the
     * server asks for at startup is answered by an override below.
     *
     * One folder per test keeps each startup independent. LevelDB takes a directory lock, so
     * two servers must not open the same world at once.
     */
    const debugConfig = (levelName: string, options: { ticking?: boolean; processTitle?: boolean } = {}) =>
        new (class DebugConfig extends Config {
            public override async enable() {}

            public override getServerIp() {
                return '0.0.0.0';
            }

            public override getLevelName() {
                return levelName;
            }

            public override getWorlds() {
                return {
                    [levelName]: { generator: 'Flat', provider: 'LevelDB', seed: 1 }
                };
            }

            /** Zero: this is a startup smoke test, not a terrain generation one. */
            public override getPreloadRadius() {
                return 0;
            }

            public override getChunkSendBudgetMs() {
                return 5;
            }

            public override getMaxPlayers() {
                return 1;
            }

            public override getGamemode() {
                return 'creative';
            }

            public override getMotd() {
                return 'CI';
            }

            public override getViewDistance() {
                return 4;
            }

            public override getOnlineMode() {
                return false;
            }

            public override getEnableTicking() {
                return options.ticking ?? false;
            }

            public override getEnableProcessTitle() {
                return options.processTitle ?? false;
            }

            public override getPacketCompressionLevel() {
                return 7;
            }
        })();

    it('announces every protocol version it registered a codec for', async () => {
        const { registeredCodecs } = await import('./network/codec/CodecRegistry');
        const logger = new Logger();
        const lines: string[] = [];
        vi.spyOn(logger, 'info').mockImplementation((message) => {
            lines.push(String(message));
        });

        new Server({ logger, config: debugConfig('test-world-banner') });

        const banner = lines.join('\n');
        expect(banner).toContain(`on ${registeredCodecs.length} protocol versions:`);
        for (const codec of registeredCodecs) {
            expect(banner).toContain(String(codec.protocolVersion));
            for (const version of codec.minecraftVersions) expect(banner).toContain(version);
        }
        // Only the newest is in the MOTD, so only it carries the marker.
        expect(banner.match(/advertised in the MOTD/g)).toHaveLength(1);
    });

    it('starts and stops without crashing', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world')
        });

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(prismarine.shutdown({ stayAlive: true })).resolves.toBeUndefined();
    });

    it('measures how long its ticks take once it is ticking', { tags: ['performance'] }, async () => {
        const prismarine = new Server({
            logger: new Logger(),
            config: debugConfig('test-world-ticking', { ticking: true })
        });
        // No tick has run yet, so there is nothing to report.
        expect(prismarine.getTickMs()).toBe(0);

        await prismarine.bootstrap('0.0.0.0', 12345);
        await new Promise((resolve) => setTimeout(resolve, 200));
        try {
            const tickMs = prismarine.getTickMs();
            expect(tickMs).toBeGreaterThan(0);
            // An idle flat world with no chunks loaded does not take a whole tick period.
            expect(tickMs).toBeLessThan(50);
        } finally {
            await prismarine.shutdown({ stayAlive: true });
        }
    });

    it('refreshes the process title every five seconds', { tags: ['performance'] }, async () => {
        const descriptor = Object.getOwnPropertyDescriptor(process, 'title');
        if (descriptor === undefined) throw new Error('process.title has no property descriptor');
        let title = process.title;
        const writes: string[] = [];
        Object.defineProperty(process, 'title', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: () => title,
            set: (next: string) => {
                title = next;
                writes.push(next);
            }
        });

        const prismarine = new Server({
            logger: new Logger(),
            config: debugConfig('test-world-process-title', { ticking: true, processTitle: true })
        });
        let bootstrapped = false;
        try {
            await prismarine.bootstrap('0.0.0.0', 12345);
            bootstrapped = true;
            await new Promise((resolve) => setTimeout(resolve, 4500));
            expect(writes.length).toBeLessThanOrEqual(1);

            await new Promise((resolve) => setTimeout(resolve, 1000));
            expect(writes.length).toBeGreaterThanOrEqual(1);
            expect(writes.length).toBeLessThanOrEqual(2);
        } finally {
            try {
                if (bootstrapped) await prismarine.shutdown({ stayAlive: true });
            } finally {
                Object.defineProperty(process, 'title', descriptor);
            }
        }
    });

    it('starts and stops without crashing in headless mode', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world-headless'),
            headless: true
        });

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(prismarine.shutdown({ stayAlive: true })).resolves.toBeUndefined();
    });
});
