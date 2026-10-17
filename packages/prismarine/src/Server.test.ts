import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import Server from './Server';

vi.mock('@jsprismarine/raknet', async (importActual) => {
    const MockRakNetListener = vi.fn(function (this: any) {
        this.start = vi.fn();
        this.on = vi.fn();
    });
    return {
        ...(((await importActual()) as any) || {}),
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
     * One folder per test on purpose: these tests stub `shutdown`, so the server they started is
     * left running and still holding its world. LevelDB takes a directory lock - two writers on
     * one world delete each other's files - so a second server pointed at the same folder is
     * refused, as it should be.
     */
    const debugConfig = (levelName: string) =>
        new (class DebugConfig {
            public enable() {}
            public disable() {}

            public getPort() {
                return 19199;
            }

            public getServerIp() {
                return '0.0.0.0';
            }

            public getLevelName() {
                return levelName;
            }

            public getWorlds() {
                return {
                    [levelName]: { generator: 'Flat', provider: 'LevelDB', seed: 1 }
                };
            }

            /** Zero: this is a startup smoke test, not a terrain generation one. */
            public getPreloadRadius() {
                return 0;
            }

            public getChunkSendBudgetMs() {
                return 5;
            }

            public getMaxPlayers() {
                return 1;
            }

            public getGamemode() {
                return 1;
            }

            public getMotd() {
                return 'CI';
            }

            public getViewDistance() {
                return 4;
            }

            public getOnlineMode() {
                return false;
            }

            public getEnableEval() {
                return false;
            }

            public getEnableTicking() {
                return false;
            }

            public getEnableProcessTitle() {
                return false;
            }

            public getPacketCompressionLevel() {
                return 7;
            }
        })() as any;

    it('starts and stops without crashing', async () => {
        const logger = new Logger();
        const prismarine = new Server({
            logger,
            config: debugConfig('test-world')
        });

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockImplementation((() => {}) as any);

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

        const mockExit = vi.spyOn(prismarine, 'shutdown').mockImplementation((() => {}) as any);

        await prismarine.bootstrap('0.0.0.0', 12345);
        await expect(() => prismarine.shutdown()).not.toThrow();
        expect(mockExit).toBeCalledTimes(1);
    });
});
