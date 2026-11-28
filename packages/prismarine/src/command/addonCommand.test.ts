import type { Logger } from '@jsprismarine/logger';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { AddonManager } from '../addons/AddonManager';
import Console from '../Console';
import type { PermissionManager } from '../permission/PermissionManager';
import type SessionManager from '../SessionManager';
import { canExecute } from '../permission/PermissionManager';
import { testContent } from '../testing/entityServer';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import type GameRuleManager from '../world/GameRuleManager';
import type { Level } from '../world/Level';
import type PlayerSession from '../player/PlayerSession';
import type { StoreActor } from '../entity/data/storeActors';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { Dimensions } from '../world/DimensionType';
import { Position } from '../world/Position';
import { CommandManager } from './CommandManager';

/** A command manager over a server whose addons are a spy, and what the server logged. */
const setUp = async (installed: Awaited<ReturnType<AddonManager['list']>> = []) => {
    const logged: string[] = [];
    const listed: number[] = [];
    const installs: [spec: string, as?: string][] = [];
    const list: AddonManager['list'] = async () => {
        listed.push(1);
        return installed;
    };
    const install: AddonManager['install'] = async (spec, as) => {
        installs.push(as === undefined ? [spec] : [spec, as]);
        return { url: 'https://example.com/a.mcpack', name: 'a', version: '1.0.0', sha256: '0'.repeat(64) };
    };
    const logger = stub<Logger>({
        verbose() {},
        debug() {},
        info: (message: string) => {
            logged.push(message);
        },
        warn() {},
        error() {}
    });
    /** The players standing in the world, so a command finds the one who typed it. */
    const players: PlayerSession[] = [];
    const world: World = stub<World>({
        getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] }),
        getDimension: () => Dimensions.Overworld,
        getActor: (runtimeId: bigint): StoreActor | null =>
            players.some((session) => session.getRuntimeId() === runtimeId)
                ? stub<StoreActor>({ getWorld: () => world, getRuntimeId: () => runtimeId })
                : null,
        viewerOf: (runtimeId: bigint) => players.find((session) => session.getRuntimeId() === runtimeId),
        getLevel: () => level,
        getServer: () => server
    });
    const level: Level = stub<Level>({
        worlds: function* () {
            yield world;
        }
    });
    const server: Server = stub<Server>({
        getLogger: () => logger,
        getContent: () => testContent(),
        getSessionManager: () => stub<SessionManager>({ getSessions: () => [] }),
        getPermissionManager: () => stub<PermissionManager>({ can: canExecute }),
        getWorldManager: () =>
            stub<WorldManager>({
                getEntryWorld: () => world,
                getEntryLevel: () => level,
                getLevels: () => [level]
            }),
        getAddons: () => stub<AddonManager>({ list, install })
    });
    const commands = new CommandManager(server);
    await commands.enable();
    /** A player standing in the default world, and what they were told. */
    const player = (op: boolean) => {
        const told: string[] = [];
        const session = sessionOnPrototype({
            isOp: () => op,
            hasPermission: () => op,
            getCommandLevel: () => (op ? CommandPermissionLevel.OWNER : CommandPermissionLevel.ANY),
            getWorld: () => world,
            getPosition: () => new Position(0, 64, 0, world),
            sendMessage: async (message: string) => {
                told.push(message);
            }
        });
        players.push(session);
        return { session, told };
    };
    return { commands, server, logged, listed, installs, player };
};

describe('addon', () => {
    it('runs for the console', async () => {
        const { commands, server, logged, listed } = await setUp();
        const console = new Console(server);

        await expect(commands.dispatchCommand(console, console, 'addon list')).resolves.toBe(true);

        expect(listed).toHaveLength(1);
        expect(logged).toContain('No addons are installed; addon install <name> installs one');
    });

    it('lists each addon and marks one its author deprecated', async () => {
        const locked = { source: 'someone/packs', version: '1.0.0', url: 'https://example.com/a.mcpack' };
        const { commands, server, logged } = await setUp([
            {
                key: 'warps',
                request: { source: 'someone/packs', version: '^1.0.0' },
                locked: { ...locked, name: 'warps', sha256: '0'.repeat(64), deprecated: 'Use warps-plus instead.' },
                packs: []
            },
            {
                key: 'homes',
                request: { source: 'someone/packs', version: '^1.0.0' },
                locked: { ...locked, name: 'homes', sha256: '1'.repeat(64) },
                packs: []
            }
        ]);
        const console = new Console(server);

        await commands.dispatchCommand(console, console, 'addon list');

        expect(logged).toEqual([
            '§62 addon(s):',
            '- §ewarps§r 1.0.0 from someone/packs/warps@^1.0.0, §cdeprecated§r: Use warps-plus instead.',
            '- §ehomes§r 1.0.0 from someone/packs/homes@^1.0.0'
        ]);
    });

    it('lists the packs of an addon that holds more than a behavior pack, and the worlds it imported', async () => {
        const summary = (kind: 'behavior' | 'resource', name: string) => ({
            kind,
            name,
            uuid: '8c2b3c4e-0d1a-4c8e-9f00-000000000001',
            version: '1.0.0',
            needsRestart: [],
            dependencies: [],
            addon: false
        });
        const { commands, server, logged } = await setUp([
            {
                key: 'furniture',
                request: { path: 'addons/furniture.mcaddon' },
                locked: {
                    path: 'addons/furniture.mcaddon',
                    name: 'furniture',
                    version: '1.0.0',
                    sha256: '0'.repeat(64),
                    worlds: [{ member: 'map.mcworld', level: '00000000-0000-4000-8000-000000000001' }]
                },
                packs: [
                    { folder: 'bp', directory: '/addons/furniture/bp', summary: summary('behavior', 'Furniture') },
                    { folder: 'rp', directory: '/addons/furniture/rp', summary: summary('resource', 'Furniture') }
                ]
            }
        ]);
        const console = new Console(server);

        await commands.dispatchCommand(console, console, 'addon list');

        expect(logged).toContain(
            '- §efurniture§r 1.0.0 from addons/furniture.mcaddon, holding behavior pack bp, resource pack rp, imported 1 world'
        );
    });

    it('hands install the addon and the local name after as', async () => {
        const { commands, server, installs } = await setUp();
        const console = new Console(server);

        await commands.dispatchCommand(console, console, 'addon install someone/packs/warps@^2.0.0 as their-warps');

        expect(installs).toEqual([['someone/packs/warps@^2.0.0', 'their-warps']]);
    });

    it('takes the name after as for a path with spaces, and none from a path alone', async () => {
        const { commands, server, installs } = await setUp();
        const console = new Console(server);

        await commands.dispatchCommand(console, console, 'addon install /srv/My Addon as local-addon');
        await commands.dispatchCommand(console, console, 'addon install /srv/My Addon');

        expect(installs).toEqual([['/srv/My Addon', 'local-addon'], ['/srv/My Addon']]);
    });

    it('refuses a player without the permission, as any command it may not run', async () => {
        const { commands, listed, player } = await setUp();
        const { session, told } = player(false);

        await expect(commands.dispatchCommand(session, session, '/addon list')).resolves.toBe(false);

        expect(told).toEqual([expect.stringContaining('do not have permission')]);
        expect(listed).toEqual([]);
    });

    it('refuses an operator, whose level is below the console’s', async () => {
        const { commands, listed, player } = await setUp();
        const { session, told } = player(true);

        await expect(commands.dispatchCommand(session, session, '/addon list')).resolves.toBe(false);

        expect(told).toEqual(['§cThat command needs a higher permission level']);
        expect(listed).toEqual([]);
    });

    it('refuses an operator who reaches it through /execute', async () => {
        const { commands, listed, player } = await setUp();
        const { session, told } = player(true);

        await expect(commands.dispatchCommand(session, session, '/execute run addon list')).resolves.toBe(false);

        // The tree has no `addon` for a source the console did not type, so the line does not parse.
        expect(told).toEqual([expect.stringContaining('Syntax error')]);
        expect(listed).toEqual([]);
    });

    it("does not run from a script's command", async () => {
        const { commands, listed } = await setUp();

        expect(commands.runScriptCommand('addon list', { dimension: 'minecraft:overworld' })).toHaveProperty('error');
        expect(listed).toEqual([]);
    });
});
