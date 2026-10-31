/**
 * A command typed while the server is still generating its start region.
 *
 * The console is reading lines long before the first world has finished preloading - on a dev
 * machine at `preload-radius: 24` that is minutes - and every command path reads the default
 * world, if only for the `sendCommandFeedback` game rule. `WorldManager` used to name the
 * default world after `World.enable` resolved, so the whole preload was a window in which
 * `getDefaultWorld()` answered `undefined` while its type said `World`, and anything typed into
 * it came back as `Cannot read properties of undefined (reading 'getGameRuleManager')`.
 *
 * This boots a real server over a generator that never answers, which holds it in that window
 * for as long as the test needs.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@jsprismarine/logger';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import Server from '../Server';
import { Config } from '../config/Config';
import Chunk from '../world/chunk/Chunk';
import { Dimensions } from '../world/Dimension';
import type { CommandExecutor } from './CommandExecutor';

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

/** The port this test's server binds, which the mocked listener never actually opens. */
const PORT = 12351;

let announce = (): void => {};
let open = (): void => {};

/** Resolves once the world has asked for its first chunk, which is where the boot stops. */
const asked = new Promise<void>((resolve) => {
    announce = resolve;
});

/** The kind the held generator is registered under; the config names it under `dimensions`. */
const HELD_KIND = 'jsprismarine:held';

/** Held until the test is finished with the boot, which is what keeps the world unstarted. */
const held = new Promise<void>((resolve) => {
    open = resolve;
});

/**
 * A generator that holds the first request open for as long as the test runs.
 *
 * Registered under its own name and asked for by the config below. Holding the spawn search is
 * enough: it is the first half of the start region, so the world never reaches its preload and
 * `enable` never returns.
 */
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

describe('a command typed while the start region is still generating', () => {
    let root: string;
    let server: Server;
    let booting: Promise<void>;
    let previousDir: string | undefined;
    const answers: string[] = [];

    /** The console, as far as the dispatcher is concerned. */
    let sender: CommandExecutor;

    const run = async (line: string) => {
        answers.length = 0;
        return server.getCommandManager().dispatchCommand(sender, sender, line);
    };

    beforeAll(async () => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-command-preload-'));
        previousDir = process.env.JSP_DIR;
        process.env.JSP_DIR = root;

        server = new Server({ logger: new Logger(), config: debugConfig('preloading'), headless: true });
        vi.spyOn(server, 'shutdown').mockResolvedValue(undefined);
        server.getWorldManager().getGeneratorFactories().registerClassGenerator(HELD_KIND, HeldGenerator);

        // Deliberately not awaited. The point of the test is the state the server is in while
        // this is still running.
        booting = server.bootstrap('0.0.0.0', PORT);
        await asked;

        sender = {
            sendMessage: (message: string) => {
                answers.push(message);
            },
            getName: () => 'CONSOLE',
            getFormattedUsername: () => 'CONSOLE',
            getServer: () => server
        };
    }, 120_000);

    afterAll(async () => {
        open();
        await booting.catch(() => {});
        await server.getWorldManager().getDefaultWorld().getProvider().disable();
        rmSync(root, { recursive: true, force: true });
        if (previousDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDir;
    }, 120_000);

    it('has a default world to answer with before the start region is generated', () => {
        const world = server.getWorldManager().getDefaultWorld();

        expect(world).toBeDefined();
        expect(world.getGameRuleManager()).toBeDefined();
    });

    it('answers a vanilla command instead of throwing', async () => {
        await run('/time query daytime');

        // The answer itself. Before the default world was named ahead of its terrain this
        // read "Cannot read properties of undefined (reading 'getGameRuleManager')".
        expect(answers.join('\n')).toContain('The time is');
    });

    it('answers an unknown command with the usual refusal', async () => {
        await expect(run('/notacommand')).resolves.toBe(false);

        expect(answers.join('\n')).toContain('Unknown command');
    });
});
