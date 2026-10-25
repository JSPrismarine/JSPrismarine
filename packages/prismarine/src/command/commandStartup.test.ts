/**
 * The vanilla command set against a real booted server.
 *
 * `host.test.ts` exercises the host's verbs over doubles; this boots the thing
 * itself - real managers, a real Flat world, a real LevelDB provider - and
 * runs command lines through `CommandManager.dispatchCommand`, which is the
 * path a player's `CommandRequestPacket` takes. The two together are what say
 * the command layer is wired rather than merely present.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@jsprismarine/logger';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import Server from '../Server';
import { Config } from '../config/Config';
import type { World } from '../world/World';
import type { CommandExecutor } from './CommandExecutor';
import { UNWIRED_COMMANDS } from './vanillaCommands';

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

/** A config that answers every startup question without reading a file, as `startup.test.ts` does. */
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

describe('the command layer on a booted server', () => {
    let root: string;
    let server: Server;
    let world: World;
    const answers: string[] = [];

    /** The console, as far as the dispatcher is concerned. */
    let sender: CommandExecutor;

    const run = async (line: string) => {
        answers.length = 0;
        return server.getCommandManager().dispatchCommand(sender, sender, line);
    };

    /** Restored in `afterAll`, so a later test in the same worker reads what it expects. */
    let previousDir: string | undefined;

    beforeAll(async () => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-command-startup-'));
        previousDir = process.env.JSP_DIR;
        process.env.JSP_DIR = root;

        server = new Server({ logger: new Logger(), config: debugConfig('commands'), headless: true });
        vi.spyOn(server, 'shutdown').mockResolvedValue(undefined);
        await server.bootstrap('0.0.0.0', 12347);

        world = server.getWorldManager().getDefaultWorld();
        // Nothing is preloaded at radius 0, and the command verbs write through
        // the synchronous loaded-chunk path on purpose, so the chunk the test
        // writes into is asked for first - which is what a player standing in
        // it would have done.
        await world.getChunkAt(0, 0);

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
        // Guarded: a boot that threw leaves no world, and failing to tidy up
        // would report a second failure on top of the real one.
        await world?.getProvider()?.close?.();
        rmSync(root, { recursive: true, force: true });
        if (previousDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDir;
    });

    it('registers the wired set and nothing else', () => {
        const registry = server.getCommandManager().getVanillaCommands();

        expect(registry.getNames().length).toBeGreaterThan(0);
        expect(registry.getExcludedNames().sort()).toEqual(Object.keys(UNWIRED_COMMANDS).sort());
    });

    it('places a block through /setblock', async () => {
        await expect(run('/setblock 0 70 0 minecraft:stone')).resolves.toBe(true);

        expect(world.loadedBlockAt(0, 70, 0)?.name).toBe('minecraft:stone');
    });

    it('fills a region through /fill', async () => {
        await expect(run('/fill 1 70 1 2 70 2 minecraft:cobblestone')).resolves.toBe(true);

        expect(world.loadedBlockAt(1, 70, 1)?.name).toBe('minecraft:cobblestone');
        expect(world.loadedBlockAt(2, 70, 2)?.name).toBe('minecraft:cobblestone');
    });

    it('summons an entity through /summon', async () => {
        const before = world.getEntities().length;

        await expect(run('/summon minecraft:pig 4 70 4')).resolves.toBe(true);

        expect(world.getEntities().length).toBe(before + 1);
        expect(world.getEntities().at(-1)?.getType()).toBe('minecraft:pig');
    });

    it('kills what it summoned through /kill', async () => {
        await run('/summon minecraft:cow 6 70 6');
        const cow = world.getEntities().find((entity) => entity.getType() === 'minecraft:cow');

        await expect(run('/kill @e[type=cow]')).resolves.toBe(true);
        // Dead, not gone: a mob leaves the world after its death animation, and
        // this server is booted with ticking off so nothing advances it.
        expect(cow?.isAlive()).toBe(false);
    });

    it('changes the time through /time', async () => {
        await expect(run('/time set 6000')).resolves.toBe(true);

        expect(world.getTicks()).toBe(6000);
    });

    it('reads and writes a gamerule under the name the world keeps', async () => {
        await expect(run('/gamerule fall_damage false')).resolves.toBe(true);

        expect(world.getGameRuleManager().getGameRule('fallDamage')?.[0]).toBe(false);
    });

    it('answers /help with the usage lines of the wired set', async () => {
        await expect(run('/help')).resolves.toBe(true);

        expect(answers.some((line) => line.startsWith('/setblock'))).toBe(true);
    });

    it('runs a chain through /execute', async () => {
        await run('/summon minecraft:pig 8 70 8');

        await expect(run('/execute as @e[type=pig] at @s run setblock ~ ~-1 ~ minecraft:gold_block')).resolves.toBe(
            true
        );
        expect(world.loadedBlockAt(8, 69, 8)?.name).toBe('minecraft:gold_block');
    });

    it('tests a real block through /testforblock', async () => {
        await run('/setblock 3 70 3 minecraft:stone');

        await expect(run('/testforblock 3 70 3 minecraft:stone')).resolves.toBe(true);
        await expect(run('/testforblock 3 70 3 minecraft:dirt')).resolves.toBe(false);
    });

    it('counts real entities through /testfor', async () => {
        await run('/summon minecraft:sheep 9 70 9');

        await expect(run('/testfor @e[type=sheep]')).resolves.toBe(true);
        await expect(run('/testfor @e[type=wolf]')).resolves.toBe(false);
    });

    it('refuses a command whose subsystem is missing', async () => {
        await expect(run('/effect give @s minecraft:speed')).resolves.toBe(false);

        expect(answers.some((line) => line.includes('Unknown command'))).toBe(true);
    });

    it('still runs the class-registered commands the package does not supersede', async () => {
        await expect(run('/version')).resolves.toBe(true);

        expect(answers.some((line) => line.includes('JSPrismarine'))).toBe(true);
    });
});
