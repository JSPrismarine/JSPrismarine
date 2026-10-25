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
     * One folder per test on purpose: these tests stub `shutdown`, so the server they started is
     * left running and still holding its world. LevelDB takes a directory lock - two writers on
     * one world delete each other's files - so a second server pointed at the same folder is
     * refused, as it should be.
     */
    const debugConfig = (levelName: string) =>
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
                return false;
            }

            public override getEnableProcessTitle() {
                return false;
            }

            public override getPacketCompressionLevel() {
                return 7;
            }
        })();

    it('starts and stops without crashing', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world')
        });

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockResolvedValue(undefined);

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(() => prismarine.shutdown()).not.toThrow();
        expect(mockExit).toBeCalledTimes(1);
    });

    it('starts and stops without crashing in headless mode', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world-headless'),
            headless: true
        });

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockResolvedValue(undefined);

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(() => prismarine.shutdown()).not.toThrow();
        expect(mockExit).toBeCalledTimes(1);
    });
});
