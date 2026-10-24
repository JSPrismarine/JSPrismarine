import type { CommandDispatcher } from '@jsprismarine/brigadier';
import type { Logger } from '@jsprismarine/logger';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import { Command, argument, literal } from '../command/Command';
import { CommandArgumentEntity } from '../command/CommandArguments';
import type { CommandExecutor } from '../command/CommandExecutor';
import { CommandManager } from '../command/CommandManager';
import type { Config } from '../config/Config';
import type PermissionManager from '../permission/PermissionManager';
import { canExecute } from '../permission/PermissionManager';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import PlayerSession from './PlayerSession';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import type DataPacket from './packet/DataPacket';
import { CommandParameterType } from './type/CommandParameter';

/** What a fresh `permissions.json` grants everyone. */
const DEFAULT_PERMISSIONS = ['minecraft.command.help', 'minecraft.command.list', 'minecraft.command.me'];

/**
 * The `AvailableCommandsPacket` the default command set produces for one player, through the
 * real command manager and the real permission rules over a fixed set of grants.
 */
const commandsSentTo = async (
    { op = false, permissions = DEFAULT_PERMISSIONS }: { op?: boolean; permissions?: string[] } = {},
    register?: (commandManager: CommandManager) => Promise<void>
) => {
    const sent: DataPacket[] = [];
    const players: Player[] = [];
    const logger = stub<Logger>({ verbose() {}, debug() {}, info() {}, warn() {}, error() {} });
    const server = stub<Server>({
        emit: async () => {},
        getLogger: () => logger,
        getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => players }),
        getPermissionManager: () =>
            stub<PermissionManager>({
                can: canExecute,
                getDefaultPermissions: () => DEFAULT_PERMISSIONS
            }),
        getCommandManager: () => commandManager,
        // Read once by the session's constructor.
        getConfig: () =>
            stub<Config>({
                getProximityBroadcast: () => false,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4
            })
    });
    const commandManager = new CommandManager(server);
    await commandManager.enable();
    await register?.(commandManager);

    const player = stub<Player>({
        getName: () => 'Steve',
        getServer: () => server,
        isOp: () => op,
        getPermissions: () => permissions
    });
    players.push(player);
    const connection = stub<ClientConnection>({
        sendDataPacket: async (packet) => {
            sent.push(packet);
        }
    });

    await new PlayerSession(server, connection, player).sendAvailableCommands();

    const [packet] = sent;
    if (!(packet instanceof AvailableCommandsPacket)) throw new Error('No AvailableCommandsPacket was sent');
    return packet.commandData;
};

/** `name: type` per parameter, the way the client's autocomplete would show an overload. */
const spell = (overload: { paramName: string; paramType: number; enum: { name: string } | null }[]) =>
    overload.map(({ paramName, paramType, enum: _enum }) => `${paramName}: ${_enum?.name ?? paramType}`);

describe('PlayerSession', () => {
    describe('sendAvailableCommands', () => {
        it('sends each command once', async () => {
            // The client keys commands by name; `tp` used to arrive four times over.
            const names = (await commandsSentTo({ op: true })).map(({ commandName }) => commandName);

            expect(names).toContain('tp');
            expect(new Set(names).size).toBe(names.length);
        });

        it('describes brigadier arguments by their node name and parse symbol', async () => {
            // These went out with empty overloads: the built-in types were checked after the
            // prismarine-argument guard had already returned.
            const commands = await commandsSentTo({ op: true });
            const overloadsOf = (name: string) =>
                commands.find(({ commandName }) => commandName === name)?.overloads.map(spell);

            const message = `message: ${CommandParameterType.Message}`;
            expect(overloadsOf('say')).toEqual([[message]]);
            expect(overloadsOf('me')).toEqual([[message]]);
            expect(overloadsOf('time')).toEqual([
                [],
                [`action: ${CommandParameterType.String}`, `value: ${CommandParameterType.Int}`]
            ]);
            expect(overloadsOf('ban')).toEqual([
                ['player: Player'],
                ['player: Player', `reason: ${CommandParameterType.Message}`]
            ]);
        });

        it('folds overloads that read the same into one', async () => {
            class EchoCommand extends Command {
                public constructor() {
                    super({ id: 'test:echo' });
                }

                public async register(dispatcher: CommandDispatcher<CommandExecutor>): Promise<void> {
                    // Two nodes, one description: both hold a target the client sees as `victim`.
                    dispatcher.register(
                        literal('echo')
                            .then(argument('a', new CommandArgumentEntity({ name: 'victim' })).executes(() => {}))
                            .then(argument('b', new CommandArgumentEntity({ name: 'victim' })).executes(() => {}))
                    );
                }
            }
            const commands = await commandsSentTo({ op: true }, (commandManager) =>
                commandManager.registerCommand(new EchoCommand())
            );

            const echo = commands.find(({ commandName }) => commandName === 'echo');
            expect(echo?.overloads.map(spell)).toEqual([[`victim: ${CommandParameterType.Target}`]]);
        });

        it('fills the EntityType enum /summon completes from', async () => {
            const commands = await commandsSentTo({ op: true });
            const [entity] = commands.find(({ commandName }) => commandName === 'summon')?.overloads[0] ?? [];

            expect(entity?.enum?.name).toBe('EntityType');
            expect(entity?.enum?.values).toContain('zombie');
        });

        it('sends an operator every command, open ones as any and the rest as gamedirectors', async () => {
            const levels = new Map(
                (await commandsSentTo({ op: true })).map(({ commandName, permission }) => [commandName, permission])
            );

            expect(levels.get('help')).toBe(CommandPermissionLevel.ANY);
            expect(levels.get('me')).toBe(CommandPermissionLevel.ANY);
            expect(levels.get('say')).toBe(CommandPermissionLevel.GAME_DIRECTORS);
            expect(levels.get('tp')).toBe(CommandPermissionLevel.GAME_DIRECTORS);
            expect(levels.get('stop')).toBe(CommandPermissionLevel.GAME_DIRECTORS);
        });

        it('sends a player only the commands they may run, at their own level', async () => {
            // The default grants, plus one operator command by name. The list is filtered to
            // what this player may run, and nothing in it is placed above the level the
            // client was given for them, or the client would hide a command the server runs.
            const commands = await commandsSentTo({ permissions: [...DEFAULT_PERMISSIONS, 'minecraft.command.kick'] });
            const names = commands.map(({ commandName }) => commandName);

            expect(names).toContain('help');
            expect(names).toContain('kick');
            expect(names).not.toContain('say');
            expect(names).not.toContain('tp');
            expect(commands.every(({ permission }) => permission === CommandPermissionLevel.ANY)).toBe(true);
        });
    });
});
