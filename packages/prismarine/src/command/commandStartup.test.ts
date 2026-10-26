/**
 * The vanilla command set against a real booted server.
 *
 * `host.test.ts` exercises the host's verbs over doubles; this boots the thing
 * itself - real managers, a real Flat world, a real LevelDB provider - and
 * runs command lines through `CommandManager.dispatchCommand`, which is the
 * path a player's `CommandRequestPacket` takes. The two together are what say
 * the command layer is wired rather than merely present.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@jsprismarine/logger';
import { load } from '@jsprismarine/packs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import Server from '../Server';
import { Config } from '../config/Config';
import { buildContentTags } from '../content/tags';
import { openContainerContents } from '../inventory/containerStore';
import { EYE_HEIGHT } from '../entity/Human';
import { stub } from '../testing/stub.test.helper';
import Player from '../Player';
import type { World } from '../world/World';
import { Position } from '../world/Position';
import type { CommandExecutor } from './CommandExecutor';
import { UNWIRED_COMMANDS } from './vanillaCommands';
import { stubOf } from '../testing/stub.test.helper';

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

/** Writes the entity definitions this command integration test exercises. */
const writeBehaviorPack = (at: string, identifiers: readonly string[]): void => {
    const files: Record<string, unknown> = {
        'manifest.json': {
            format_version: 2,
            header: {
                name: 'commandfixture',
                uuid: '2f3c1f00-0000-4000-8000-0000000000a1',
                version: [1, 0, 0],
                min_engine_version: [1, 26, 50]
            },
            modules: [{ type: 'data', uuid: '2f3c1f00-0000-4000-8001-0000000000a1', version: [1, 0, 0] }]
        }
    };
    for (const [index, identifier] of identifiers.entries()) {
        files[`entities/${index}-${identifier.replace(':', '_')}.json`] = {
            format_version: '1.21.0',
            'minecraft:entity': {
                description: { identifier, is_spawnable: true, is_summonable: true },
                components: { 'minecraft:health': { value: 40, max: 40 } }
            }
        };
    }

    for (const [relative, data] of Object.entries(files)) {
        const absolute = path.join(at, ...relative.split('/'));
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, JSON.stringify(data));
    }
};

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
        writeBehaviorPack(path.join(root, 'behaviorpack'), ['minecraft:pig', 'minecraft:cow', 'minecraft:sheep']);
        writeFileSync(
            path.join(root, 'config.yaml'),
            [
                'content-strict: false',
                'content-world-packs:',
                `    - ${path.join(root, 'behaviorpack')}`,
                'content-datapacks: []',
                ''
            ].join('\n')
        );
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

    it('uses a player’s feet when /summon has no coordinates', async () => {
        const player = stubOf(Player, {
            getRuntimeId: () => 99n,
            getType: () => 'minecraft:player',
            getName: () => 'TestPlayer',
            getPosition: () => new Position(11.5, 70 + EYE_HEIGHT, 12.5, world),
            getFeetY: () => 70,
            getWorld: () => world,
            yaw: 0,
            pitch: 0
        });

        await expect(
            server.getCommandManager().dispatchCommand(sender, player, '/summon minecraft:pig ~ ~ ~')
        ).resolves.toBe(true);

        const summoned = world
            .dataEntities()
            ?.runtime.all()
            .find((entity) => entity.identifier === 'minecraft:pig' && entity.position.x === 11.5);
        expect(summoned?.position).toEqual({ x: 11.5, y: 70, z: 12.5 });
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

        expect(world.getGameRuleManager()?.getGameRule('fallDamage')?.[0]).toBe(false);
    });

    it('answers /help with a bordered page of the wired set', async () => {
        await expect(run('/help')).resolves.toBe(true);

        expect(answers.some((line) => line.includes('§fHelp §b1§f/'))).toBe(true);
        expect(answers.some((line) => line.includes('/attribute'))).toBe(true);
        expect(answers.some((line) => line.includes('Usage:'))).toBe(true);
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

    describe('the mcfunction runtime, over a datapack on disk', () => {
        /**
         * Loaded through `@jsprismarine/packs` and handed to the command
         * manager, rather than through a whole content build: the functions
         * are the only half of a pack stack this exercises, and swapping the
         * server's content would also swap the block tables the rest of this
         * file writes through.
         */
        beforeAll(() => {
            const pack = path.join(root, 'datapack');
            const files: Record<string, string> = {
                'pack.mcmeta': JSON.stringify({ pack: { description: 'fixture', min_format: 121, max_format: 121 } }),
                'data/fixture/function/build.mcfunction': [
                    '# Two blocks, one function.',
                    'setblock 10 70 10 minecraft:stone',
                    'setblock 10 71 10 minecraft:cobblestone',
                    ''
                ].join('\n'),
                'data/fixture/function/place.mcfunction': '$setblock $(x) $(y) $(z) minecraft:gold_block\n',
                'data/fixture/function/under.mcfunction': 'setblock ~ ~-1 ~ minecraft:diamond_block\n',
                'data/fixture/function/call.mcfunction': 'function fixture:build\n',
                'data/fixture/function/ticked.mcfunction': 'setblock 11 70 11 minecraft:emerald_block\n',
                'data/fixture/function/plain.mcfunction': 'setblock 14 70 14 minecraft:iron_block\n',
                'data/fixture/function/wins.mcfunction': 'return 1\n',
                'data/fixture/function/loses.mcfunction': 'return 0\n',
                'data/fixture/tags/function/both.json': JSON.stringify({
                    values: ['fixture:build', 'fixture:place']
                }),
                'data/fixture/tags/function/either.json': JSON.stringify({
                    values: ['fixture:loses', 'fixture:wins']
                }),
                'data/minecraft/tags/function/tick.json': JSON.stringify({ values: ['fixture:ticked'] })
            };
            for (const [relative, text] of Object.entries(files)) {
                const absolute = path.join(pack, ...relative.split('/'));
                mkdirSync(path.dirname(absolute), { recursive: true });
                writeFileSync(absolute, text);
            }

            const { definitions } = load([{ kind: 'datapack', path: pack }]);
            server.getCommandManager().setFunctionContent({
                functions: definitions.functions,
                tags: buildContentTags(definitions.tags)
            });
        });

        it('runs a function and changes the world', async () => {
            await expect(run('/function fixture:build')).resolves.toBe(true);

            expect(world.loadedBlockAt(10, 70, 10)?.name).toBe('minecraft:stone');
            expect(world.loadedBlockAt(10, 71, 10)?.name).toBe('minecraft:cobblestone');
        });

        it('substitutes a macro from the compound on the command line', async () => {
            await expect(run('/function fixture:place {x:12,y:70,z:12}')).resolves.toBe(true);

            expect(world.loadedBlockAt(12, 70, 12)?.name).toBe('minecraft:gold_block');
        });

        it('runs a function from inside another one', async () => {
            await run('/setblock 10 70 10 minecraft:air');

            await expect(run('/function fixture:call')).resolves.toBe(true);

            expect(world.loadedBlockAt(10, 70, 10)?.name).toBe('minecraft:stone');
        });

        it('runs every member of a function tag', async () => {
            await run('/setblock 10 71 10 minecraft:air');

            // `fixture:place` is a macro with no arguments here, so it is
            // skipped and `fixture:build` is what the tag actually runs.
            await expect(run('/function #fixture:both')).resolves.toBe(true);

            expect(world.loadedBlockAt(10, 71, 10)?.name).toBe('minecraft:cobblestone');
        });

        it('runs a function once per entity under /execute as', async () => {
            // Inside chunk (0, 0), which is the one chunk this test file asked
            // for: a command writes through the loaded-chunk path and never
            // generates terrain by naming a position.
            await run('/summon minecraft:pig 13 70 13');
            await run('/summon minecraft:pig 15 70 15');

            await expect(run('/execute as @e[type=pig] at @s run function fixture:under')).resolves.toBe(true);

            expect(world.loadedBlockAt(13, 69, 13)?.name).toBe('minecraft:diamond_block');
            expect(world.loadedBlockAt(15, 69, 15)?.name).toBe('minecraft:diamond_block');
        });

        it('reports a function nobody declared instead of accepting the line', async () => {
            await expect(run('/function fixture:nothing')).resolves.toBe(false);
        });

        it('runs #minecraft:tick once a tick', async () => {
            expect(world.loadedBlockAt(11, 70, 11)?.name).not.toBe('minecraft:emerald_block');

            await server.getCommandManager().tickFunctions();

            expect(world.loadedBlockAt(11, 70, 11)?.name).toBe('minecraft:emerald_block');
        });

        it('runs what /schedule queued on the tick it comes due', async () => {
            await run('/setblock 10 71 10 minecraft:air');
            await expect(run('/schedule function fixture:build 2')).resolves.toBe(true);

            await server.getCommandManager().tickFunctions();
            expect(world.loadedBlockAt(10, 71, 10)?.name).toBe('minecraft:air');

            await server.getCommandManager().tickFunctions();
            expect(world.loadedBlockAt(10, 71, 10)?.name).toBe('minecraft:cobblestone');
        });

        it('reads a /schedule delay in seconds as the 100 ticks it is', async () => {
            await run('/setblock 10 71 10 minecraft:air');
            await expect(run('/schedule function fixture:build 5s')).resolves.toBe(true);

            for (let tick = 0; tick < 99; tick += 1) await server.getCommandManager().tickFunctions();
            expect(world.loadedBlockAt(10, 71, 10)?.name).toBe('minecraft:air');

            await server.getCommandManager().tickFunctions();
            expect(world.loadedBlockAt(10, 71, 10)?.name).toBe('minecraft:cobblestone');
        });

        /** Runs the body only when the named function matched, and says whether it did. */
        const ifFunction = async (reference: string, at: [number, number, number]) => {
            const [x, y, z] = at;
            await run(`/setblock ${x} ${y} ${z} minecraft:air`);
            await run(`/execute if function ${reference} run setblock ${x} ${y} ${z} minecraft:gold_block`);
            return world.loadedBlockAt(x, y, z)?.name === 'minecraft:gold_block';
        };

        it('does not match a function that ran its lines and never returned', async () => {
            // The old rule answered with the number of lines that ran, so a
            // one-line function matched and almost everything else did too.
            await expect(ifFunction('fixture:plain', [5, 70, 5])).resolves.toBe(false);

            // And it did run: the condition evaluates the function either way.
            expect(world.loadedBlockAt(14, 70, 14)?.name).toBe('minecraft:iron_block');
        });

        it('matches a function that returned a non-zero value', async () => {
            await expect(ifFunction('fixture:wins', [5, 71, 5])).resolves.toBe(true);
        });

        it('does not match a function that returned zero', async () => {
            await expect(ifFunction('fixture:loses', [5, 72, 5])).resolves.toBe(false);
        });

        it('matches a tag when any of its members matched', async () => {
            // `fixture:loses` runs first and returns 0; the tag still matches
            // because `fixture:wins` is also run and does.
            await expect(ifFunction('#fixture:either', [7, 70, 7])).resolves.toBe(true);
        });

        it('refuses a /return typed outside a function', async () => {
            await expect(run('/return 1')).resolves.toBe(false);
            expect(answers.some((line) => line.includes('inside a function'))).toBe(true);
        });
    });
});

/**
 * The same server over a pack stack with two fixtures added to it.
 *
 * A pack-defined entity needs a pack to define it, `/loot` needs a table to
 * roll, and a container block needs the block entity records the content
 * world keeps. So this boots a second server over the real pack stack plus
 * a behavior pack declaring the entity types this test exercises and a
 * datapack declaring one loot table.
 */
describe('the command layer on a server with packs of its own', () => {
    let root: string;
    let server: Server;
    let world: World;
    let sender: CommandExecutor;
    let previousDir: string | undefined;

    const run = async (line: string) => server.getCommandManager().dispatchCommand(sender, sender, line);

    /** A datapack whose one loot table rolls a fixed, countable stack. */
    const writeDatapack = (at: string): void => {
        const files: Record<string, unknown> = {
            'pack.mcmeta': { pack: { description: 'commandfixture', min_format: 121, max_format: 121 } },
            'data/mypack/loot_table/gifts.json': {
                type: 'minecraft:chest',
                pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }] }]
            }
        };
        for (const [relative, data] of Object.entries(files)) {
            const absolute = path.join(at, ...relative.split('/'));
            mkdirSync(path.dirname(absolute), { recursive: true });
            writeFileSync(absolute, JSON.stringify(data));
        }
    };

    beforeAll(async () => {
        root = mkdtempSync(path.join(tmpdir(), 'jsprismarine-command-content-'));
        writeBehaviorPack(path.join(root, 'behaviorpack'), ['mypack:dragon', 'minecraft:villager_v2']);
        writeDatapack(path.join(root, 'datapack'));
        // `readContentSettings` reads this file out of `JSP_DIR`, before the
        // `Config` the server was handed is enabled, so the two fixtures go in
        // here rather than through `debugConfig`.
        writeFileSync(
            path.join(root, 'config.yaml'),
            [
                'content-strict: false',
                'content-world-packs:',
                `    - ${path.join(root, 'behaviorpack')}`,
                'content-datapacks:',
                `    - ${path.join(root, 'datapack')}`,
                ''
            ].join('\n')
        );

        previousDir = process.env.JSP_DIR;
        process.env.JSP_DIR = root;

        server = new Server({ logger: new Logger(), config: debugConfig('content-commands'), headless: true });
        vi.spyOn(server, 'shutdown').mockResolvedValue(undefined);
        await server.bootstrap('0.0.0.0', 12348);

        world = server.getWorldManager().getDefaultWorld();
        await world.getChunkAt(0, 0);

        sender = {
            sendMessage: async () => {},
            getName: () => 'CONSOLE',
            getFormattedUsername: () => 'CONSOLE',
            getServer: () => server
        };
    }, 120_000);

    afterAll(async () => {
        await world?.getProvider()?.close?.();
        rmSync(root, { recursive: true, force: true });
        if (previousDir === undefined) delete process.env.JSP_DIR;
        else process.env.JSP_DIR = previousDir;
    });

    /** The data-driven entity standing at a position, which is what a summon has to produce. */
    const dataEntityAt = (x: number, z: number) =>
        world
            .dataEntities()
            ?.runtime.all()
            .find((entity) => Math.floor(entity.body.position.x) === x && Math.floor(entity.body.position.z) === z);

    it('built its content from the pack stack, the fixtures included', () => {
        const content = server.getContent();

        expect(content.entities.registry.has('mypack:dragon')).toBe(true);
        expect(content.entities.registry.has('minecraft:villager_v2')).toBe(true);
        expect(content.loot.table('mypack:gifts')).toBeDefined();
    });

    it('summons a pack-defined entity by the name only the pack knows', async () => {
        // The parse is the half that used to fail: `mypack:dragon` is not in
        // Mojang's frozen 229-entry `EntityType` enum.
        await expect(run('/summon mypack:dragon 4 70 4')).resolves.toBe(true);

        expect(dataEntityAt(4, 4)?.identifier).toBe('mypack:dragon');
    });

    it('summons the villager Bedrock actually spawns, with its Java brain', async () => {
        // Mojang's enum has `villager` and no `villager_v2`, so the typed name
        // is the legacy entity's and the spawned one has to be the current one.
        await expect(run('/summon villager 6 70 6')).resolves.toBe(true);

        const villager = dataEntityAt(6, 6);
        expect(villager?.identifier).toBe('minecraft:villager_v2');
        expect(villager?.brainMob?.id).toBe('minecraft:villager');
    });

    /**
     * What a block holds, read the way opening it reads.
     *
     * `openContainerContents` is the read the client's `InventoryContent`
     * follows a `ContainerOpen` with, so a stack that shows up here is a
     * stack the next player to open the block is sent. It asks its player
     * only for the server and the dimension, because the one container whose
     * slots belong to a player is the ender chest and none of these is one.
     */
    const contentsOf = (at: readonly [number, number, number], identifier: string) =>
        openContainerContents(
            stub<Player>({ getServer: () => server, getWorld: () => world }),
            { x: at[0], y: at[1], z: at[2] },
            identifier
        );

    it('fills a real chest through /loot insert, and the chest keeps it', async () => {
        await run('/setblock 8 70 8 minecraft:chest');

        await expect(run('/loot insert 8 70 8 loot mypack:gifts')).resolves.toBe(true);

        // Read back through the open path rather than through the one the
        // command wrote with, so this says the chest holds it and not merely
        // that the write returned.
        const held = contentsOf([8, 70, 8], 'minecraft:chest');
        expect(held.filter((entry) => entry.getItem().getName() === 'minecraft:cobblestone')).toHaveLength(1);
    });

    it('refuses /loot insert where no block stores anything', async () => {
        await run('/setblock 9 70 9 minecraft:stone');

        await expect(run('/loot insert 9 70 9 loot mypack:gifts')).resolves.toBe(false);
    });

    it('writes a container block slot through /replaceitem block', async () => {
        await run('/setblock 10 70 10 minecraft:chest');

        await expect(run('/replaceitem block 10 70 10 slot.container 5 minecraft:diamond 3')).resolves.toBe(true);

        const held = contentsOf([10, 70, 10], 'minecraft:chest');
        expect(held[5]?.getItem().getName()).toBe('minecraft:diamond');
        expect(held[5]?.getCount()).toBe(3);
    });

    it('refuses a container slot the block does not have', async () => {
        await run('/setblock 11 70 11 minecraft:hopper');

        // A hopper has five, so slot 20 is nowhere.
        await expect(run('/replaceitem block 11 70 11 slot.container 20 minecraft:diamond')).resolves.toBe(false);
    });

    it('writes a container block slot through /loot replace block too', async () => {
        await run('/setblock 12 70 12 minecraft:chest');

        await expect(run('/loot replace block 12 70 12 container.2 loot mypack:gifts')).resolves.toBe(true);

        expect(contentsOf([12, 70, 12], 'minecraft:chest')[2]?.getItem().getName()).toBe('minecraft:cobblestone');
    });
});
