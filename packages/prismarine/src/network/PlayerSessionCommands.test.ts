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
import { UNWIRED_COMMANDS } from '../command/vanillaCommands';
import type { Config } from '../config/Config';
import type { PermissionManager } from '../permission/PermissionManager';
import { canExecute } from '../permission/PermissionManager';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import PlayerSession from './PlayerSession';
import AvailableCommandsPacket from '@jsprismarine/protocol/packet/AvailableCommandsPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { CommandParameterType } from '@jsprismarine/protocol/wire/structures/CommandParameter';
import { testContent } from '../testing/entityServer';

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
    const sent: NetworkPacket[] = [];
    const players: Player[] = [];
    const logger = stub<Logger>({ verbose() {}, debug() {}, info() {}, warn() {}, error() {} });
    const server = stub<Server>({
        emit: async () => {},
        getLogger: () => logger,
        // No pack stack, so the command layer offers the commands a server without one has.
        getContent: () => testContent(),
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
            const commands = await commandsSentTo({ op: true });
            const names = commands.map(({ commandName }) => commandName);

            expect(names).toContain('teleport');
            expect(new Set(names).size).toBe(names.length);
        });

        it('folds an alias into its owner rather than sending it as a command', async () => {
            // `/tp` is `/teleport` under another name, and the packet carries that as an
            // alias enum. Sent as a command of its own it would be a second entry the client
            // has to guess the relationship of.
            const commands = await commandsSentTo({ op: true });
            const teleport = commands.find(({ commandName }) => commandName === 'teleport');

            expect(commands.map(({ commandName }) => commandName)).not.toContain('tp');
            expect(teleport?.aliases?.values).toEqual(['teleport', 'tp']);
        });

        it('describes brigadier arguments by their node name and parse symbol', async () => {
            // These went out with empty overloads: the built-in types were checked after the
            // prismarine-argument guard had already returned.
            const commands = await commandsSentTo({ op: true });
            const overloadsOf = (name: string) =>
                commands.find(({ commandName }) => commandName === name)?.overloads.map(spell);

            expect(overloadsOf('ban')).toEqual([
                ['player: Player'],
                ['player: Player', `reason: ${CommandParameterType.Message}`]
            ]);
        });

        it('describes a vanilla command through the command layer', async () => {
            // The vanilla half carries Mojang's own parameter types, which is why `/say`
            // goes out as `MESSAGE_ROOT` where a greedy string went out as `Message`.
            const commands = await commandsSentTo({ op: true });
            const overloadsOf = (name: string) =>
                commands.find(({ commandName }) => commandName === name)?.overloads.map(spell);

            expect(overloadsOf('say')).toEqual([[`message: ${CommandParameterType.MessageRoot}`]]);
            // The current Java schema keeps `add` and `set` as separate subcommands and leaves
            // the other clock routes beside them, while preserving these shared forms.
            expect(overloadsOf('time')).toEqual(
                expect.arrayContaining([
                    ['add: OPTION_ADD', `time: ${CommandParameterType.Int}`],
                    ['set: OPTION_SET', `time: ${CommandParameterType.Int}`],
                    ['query: OPTION_QUERY', 'unit: TimeQuery']
                ])
            );
        });

        it('sends only the vanilla commands a player may run', async () => {
            // A fresh `permissions.json` grants `help`, `list` and `me` and nothing else, so
            // a player who is not an operator is told about those three and no more.
            const names = (await commandsSentTo()).map(({ commandName }) => commandName);

            expect(names).toContain('help');
            expect(names).toContain('list');
            expect(names).toContain('me');
            expect(names).not.toContain('teleport');
            expect(names).not.toContain('stop');
        });

        it('never offers a command whose subsystem is missing', async () => {
            const names = (await commandsSentTo({ op: true })).map(({ commandName }) => commandName);

            for (const unwired of Object.keys(UNWIRED_COMMANDS)) expect(names).not.toContain(unwired);
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
                            .then(argument('a', new CommandArgumentEntity({ name: 'victim' })).executes(() => 0))
                            .then(argument('b', new CommandArgumentEntity({ name: 'victim' })).executes(() => 0))
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
            // Mojang's own published list rather than this server's class registry: the
            // command layer reads it out of `mojang-commands.json`, where `/summon` has it
            // as a hard enum.
            const commands = await commandsSentTo({ op: true });
            const [entity] = commands.find(({ commandName }) => commandName === 'summon')?.overloads[0] ?? [];

            expect(entity?.enum?.name).toBe('EntityType');
            expect(entity?.enum?.values).toContain('zombie');
        });

        it('fills the Item and Block enums /give and /setblock complete from', async () => {
            const commands = await commandsSentTo({ op: true });
            const firstOf = (name: string, index: number) =>
                commands.find(({ commandName }) => commandName === name)?.overloads[0]?.[index];

            expect(firstOf('give', 1)?.enum?.name).toBe('Item');
            expect(firstOf('give', 1)?.enum?.values).toContain('diamond');
            expect(firstOf('setblock', 1)?.enum?.name).toBe('Block');
            expect(firstOf('setblock', 1)?.enum?.values).toContain('stone');
        });

        it('sends an operator every command, open ones as any and the rest as gamedirectors', async () => {
            const levels = new Map(
                (await commandsSentTo({ op: true })).map(({ commandName, permission }) => [commandName, permission])
            );

            // An operator is `Owner`, which is the level that lets the client offer `/stop`.
            // The class-registered half has no level of its own and caps at `GameDirectors`.
            expect(levels.get('help')).toBe(CommandPermissionLevel.ANY);
            expect(levels.get('me')).toBe(CommandPermissionLevel.ANY);
            expect(levels.get('say')).toBe(CommandPermissionLevel.GAME_DIRECTORS);
            expect(levels.get('teleport')).toBe(CommandPermissionLevel.GAME_DIRECTORS);
            expect(levels.get('stop')).toBe(CommandPermissionLevel.OWNER);
            expect(levels.get('ban')).toBe(CommandPermissionLevel.GAME_DIRECTORS);
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
