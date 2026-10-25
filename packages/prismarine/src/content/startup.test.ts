import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';

import Server from '../Server';
import { Config } from '../config/Config';
import { CONTENT_ENABLED_ENV } from './settings';
import { buildServerContent } from './ServerContent';
import { fixtureContentOptions } from './testing';

vi.mock('@jsprismarine/raknet', async (importActual) => {
    const MockRakNetListener = vi.fn(function (this: Record<string, unknown>) {
        this.start = vi.fn();
        this.on = vi.fn();
    });
    return {
        ...(await importActual<typeof import('@jsprismarine/raknet')>()),
        RakNetListener: MockRakNetListener
    };
});

/**
 * A config that answers every startup question without reading a file, the
 * way `Server.test.ts` does. One world folder per test: these tests stub
 * `shutdown`, so each server is left holding a LevelDB directory lock.
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
            return { [levelName]: { generator: 'Flat', provider: 'LevelDB', seed: 1 } };
        }
        public override getPreloadRadius() {
            return 0;
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
    })();

const bootstrap = async (levelName: string): Promise<Server> => {
    const server = new Server({ logger: new Logger(), config: debugConfig(levelName), headless: true });
    vi.spyOn(server, 'shutdown').mockResolvedValue(undefined);
    await server.bootstrap('0.0.0.0', 12346);
    return server;
};

describe('the server with the content flag', () => {
    let root: string;

    beforeAll(() => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-content-startup-'));
        vi.stubEnv('JSP_DIR', root);
    });

    afterAll(() => {
        vi.unstubAllEnvs();
        rmSync(root, { recursive: true, force: true });
    });

    it('boots with the flag off and builds no content', async () => {
        vi.stubEnv(CONTENT_ENABLED_ENV, '0');
        const server = await bootstrap('content-off');

        expect(server.getContent()).toBeUndefined();
        await expect(() => server.shutdown()).not.toThrow();
    });

    it('boots with the flag on, and the build is reachable through the server', async () => {
        // The default stack is Mojang's two fetched halves, which CI does not have, so the
        // flag is turned on and a fixture build is handed over. `enableContent` reports a
        // missing stack member rather than refusing to start, which is what makes this work.
        vi.stubEnv(CONTENT_ENABLED_ENV, '1');
        const server = await bootstrap('content-on');
        server.setContent(buildServerContent(fixtureContentOptions()));

        expect(server.getContent()?.blocks.types.size).toBe(2);
        expect(server.getContent()?.items.registry.size).toBe(3);
        await expect(() => server.shutdown()).not.toThrow();
    });
});
