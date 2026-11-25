import type { Logger } from '@jsprismarine/logger';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import Console from '../Console';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import type { StoreActor } from '../entity/data/storeActors';
import type { Updates } from '../modules/updates';
import type PlayerSession from '../network/PlayerSession';
import type { PermissionManager } from '../permission/PermissionManager';
import { canExecute } from '../permission/PermissionManager';
import { testContent } from '../testing/entityServer';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { UpdateStatus } from '../updates/status';
import { Dimensions } from '../world/DimensionType';
import type GameRuleManager from '../world/GameRuleManager';
import type { Level } from '../world/Level';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { kernelWithUpdates } from '../modules/updates.test-utils';
import { CommandManager } from './CommandManager';
import { CONSOLE_FIRST_COMMAND_PERMISSIONS } from './updateCommands';

const AVAILABLE: UpdateStatus = {
    state: 'available',
    checkedAt: 0,
    update: { version: '9.0.0', channel: 'release', notes: 'https://example.com/notes', url: 'https://example.com' }
};

/** A command manager over a server whose update checks and host are spies. */
const setUp = async ({ host = true }: { host?: boolean } = {}) => {
    const logged: string[] = [];
    /** Settles at the first line logged, which is how the console sees feedback. */
    const firstLine = Promise.withResolvers<void>();
    const checks: number[] = [];
    const restarts: number[] = [];
    const updates: Updates = {
        status: () => AVAILABLE,
        check: async () => {
            checks.push(1);
            return AVAILABLE;
        },
        welcome: async () => undefined
    };
    const logger = stub<Logger>({
        verbose() {},
        debug() {},
        info: (message: string) => {
            logged.push(message);
            firstLine.resolve();
        },
        warn() {},
        error() {}
    });
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
        getKernel: () => kernel,
        requestRestart: () => {
            restarts.push(1);
            return host;
        }
    });
    const kernel = await kernelWithUpdates(updates);
    const commands = new CommandManager(server);
    await commands.enable();
    /** A player who holds `*` as an operator does, or only the nodes given. */
    const player = ({ op = false, nodes = [] as string[] }: { op?: boolean; nodes?: string[] }) => {
        const told: string[] = [];
        const held = op ? ['*', ...nodes] : nodes;
        const session = sessionOnPrototype({
            isOp: () => op,
            getPermissions: () => held,
            hasPermission: (node: string) => op || held.includes(node),
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
    return { commands, server, logged, firstLine: firstLine.promise, checks, restarts, player };
};

describe('update check', () => {
    it('checks now for the console and prints the outcome', async () => {
        const { commands, server, logged, firstLine, checks } = await setUp();
        const console = new Console(server);

        await expect(commands.dispatchCommand(console, console, 'update check')).resolves.toBe(true);
        await firstLine;

        expect(checks).toHaveLength(1);
        expect(logged.some((line) => line.includes('9.0.0 is out'))).toBe(true);
    });

    it('refuses an operator, whose * does not name the node', async () => {
        const { commands, checks, player } = await setUp();
        const { session, told } = player({ op: true });

        await expect(commands.dispatchCommand(session, session, '/update check')).resolves.toBe(false);

        expect(told).toEqual([expect.stringContaining(CONSOLE_FIRST_COMMAND_PERMISSIONS.update)]);
        expect(checks).toEqual([]);
    });

    it('runs for a player whose entry names the node', async () => {
        const { commands, checks, player } = await setUp();
        const { session } = player({ nodes: [CONSOLE_FIRST_COMMAND_PERMISSIONS.update] });

        await expect(commands.dispatchCommand(session, session, '/update check')).resolves.toBe(true);

        expect(checks).toHaveLength(1);
    });
});

describe('restart', () => {
    it('asks the host to restart the server', async () => {
        const { commands, server, restarts } = await setUp();
        const console = new Console(server);

        await expect(commands.dispatchCommand(console, console, 'restart')).resolves.toBe(true);

        expect(restarts).toHaveLength(1);
    });

    it('says why it cannot restart a server with no host', async () => {
        const { commands, server, logged } = await setUp({ host: false });
        const console = new Console(server);

        await expect(commands.dispatchCommand(console, console, 'restart')).resolves.toBe(false);

        expect(logged.some((line) => line.includes('no host process'))).toBe(true);
    });

    it('refuses an operator', async () => {
        const { commands, restarts, player } = await setUp();
        const { session, told } = player({ op: true });

        await expect(commands.dispatchCommand(session, session, '/restart')).resolves.toBe(false);

        expect(told).toEqual([expect.stringContaining(CONSOLE_FIRST_COMMAND_PERMISSIONS.restart)]);
        expect(restarts).toEqual([]);
    });
});
