/**
 * A shutdown asked for while the start region is still generating.
 *
 * The worlds start inside the kernel's start, and a preload can take minutes. A shutdown in that
 * window has to stop the kernel under the start that is still running, which closes the worlds
 * and cancels the preload, and the boot has to end without opening the listener.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@jsprismarine/logger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Server from './Server';
import { Config } from './config/Config';
import Chunk from './world/chunk/Chunk';
import { Dimensions } from './world/Dimension';
import { stubRakNetListener } from './testing/rakNetListener.test.helper';

stubRakNetListener();

/** The port this test's server would bind, which the mocked listener never actually opens. */
const PORT = 12352;

/** The kind the held generator is registered under; the config names it under `dimensions`. */
const HELD_KIND = 'jsprismarine:held-shutdown';

let announce = (): void => {};
let open = (): void => {};

/** Resolves once the world has asked for its first chunk, which is where the boot stops. */
const asked = new Promise<void>((resolve) => {
    announce = resolve;
});

/** Held until the shutdown has begun, which keeps the world inside its start. */
const held = new Promise<void>((resolve) => {
    open = resolve;
});

/** A generator that holds the first request open until the test releases it. */
class HeldGenerator {
    /** Hands back a chunk only once the test says so. */
    public async generateChunk(cx: number, cz: number): Promise<Chunk> {
        announce();
        await held;

        return new Chunk(cx, cz, new Map(), Dimensions.Overworld);
    }
}

/** A config that answers every startup question without reading a file. */
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
                [levelName]: {
                    provider: 'LevelDB',
                    seed: 1,
                    dimensions: { 'minecraft:overworld': { generator: { type: HELD_KIND } } }
                }
            };
        }
        public override getPreloadRadius() {
            return 1;
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

describe('a shutdown while the start region is still generating', () => {
    let root: string;
    let previousDir: string | undefined;

    beforeAll(() => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-shutdown-preload-'));
        previousDir = process.env.JSP_DIR;
        process.env.JSP_DIR = root;
    });

    afterAll(() => {
        open();
        rmSync(root, { recursive: true, force: true });
        if (previousDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDir;
    });

    it('closes the worlds and ends the boot without opening the listener', async () => {
        const server = new Server({ logger: new Logger(), config: debugConfig('stopping'), headless: true });
        server
            .getWorldManager()
            .getGeneratorFactories()
            .register({ kind: HELD_KIND, build: () => new HeldGenerator() });

        const booting = server.bootstrap('0.0.0.0', PORT);
        await asked;

        const stopping = server.shutdown({ stayAlive: true });
        open();
        await stopping;

        await expect(booting).resolves.toBeUndefined();
        expect(() => server.getMetadata()).toThrow('Server is not started');
        // Closed by the shutdown, rather than left loaded by a start that carried on after it.
        expect(server.getWorldManager().getLevels()).toEqual([]);
    }, 120_000);
});
