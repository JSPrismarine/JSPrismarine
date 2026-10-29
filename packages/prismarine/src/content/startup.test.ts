import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import { reportProgress } from '../../../../.test/reportProgress';

import Server from '../Server';
import { Config } from '../config/Config';
import { PACK_STACK_ENV } from './packStack';
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
    // Bind an OS-assigned UDP port so parallel server startup tests cannot collide.
    await server.bootstrap('127.0.0.1', 0);
    return server;
};

describe('the server building its content at startup', () => {
    let root: string;

    beforeAll(() => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-content-startup-'));
        vi.stubEnv('JSP_DIR', root);
    });

    afterAll(() => {
        vi.unstubAllEnvs();
        rmSync(root, { recursive: true, force: true });
    });

    it('builds the content it found, with no setting asking it to', async () => {
        // Mojang's two halves are pointed at nothing, so the stack is the committed
        // `jsprismarine_vanilla` overlay alone, with no fetched data.
        // That `enableContent` reports the two missing members rather than refusing to
        // start is the half of this that a server without the fetch depends on.
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, '/nowhere/bedrock');
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '/nowhere/java');

        const server = await bootstrap('content-on');

        const content = server.getContent();
        expect(content.blocks.types.get('minecraft:air')).toBeDefined();
        expect(content.blocks.types.get('minecraft:stone')).toBeDefined();
        reportProgress(`${content.blocks.types.size} block types loaded from the vanilla overlay.`);
        expect(server.getContent().diagnostics.filter((entry) => entry.code === 'pack.missing')).toHaveLength(2);
        await expect(() => server.shutdown()).not.toThrow();
    }, 60_000);

    it('runs on content a test or a plugin composed itself', async () => {
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, '/nowhere/bedrock');
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '/nowhere/java');

        const server = await bootstrap('content-supplied');
        server.setContent(buildServerContent(fixtureContentOptions()));

        expect(server.getContent().blocks.types.size).toBe(2);
        expect(server.getContent().items.registry.size).toBe(3);
        await expect(() => server.shutdown()).not.toThrow();
    }, 60_000);
});
