import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { integer } from '@jsprismarine/brigadier';
import type { Logger } from '@jsprismarine/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from '../';
import type { ChatManager } from '../chat/ChatManager';
import Console from '../Console';
import Player from '../Player';
import { PermissionManager } from '../permission/PermissionManager';
import type SessionManager from '../SessionManager';
import { stub, stubOf } from '../testing/stub.test.helper';
import UUID from '../utils/UUID';
import type GameRuleManager from '../world/GameRuleManager';
import type { GameRuleEntry } from '../world/GameRuleManager';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { CommandParameterFlags } from '../network/type/CommandParameter';
import * as Commands from './Commands';
import { Command, argument, literal } from './Command';
import { isCommandArgument } from './CommandArguments';
import type { CommandExecutor } from './CommandExecutor';
import { CommandManager } from './CommandManager';

describe('command', () => {
    describe('CommandManager', () => {
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {},
                info: () => {},
                warn: () => {},
                error: () => {}
            }),
            getSessionManager: () => ({
                getAllPlayers: () => []
            }),
            // No content build, which is what decides whether the commands
            // whose subsystem is the pack stack are registered at all.
            getContent: () => undefined,
            on: vi.fn(),
            emit: vi.fn().mockResolvedValue({})
        }))();

        it('should register commands on enable', async () => {
            const commandManager = new CommandManager(server);

            // Mock the registerClassCommand method
            commandManager.registerCommand = vi.fn();
            await commandManager.enable();

            expect(commandManager.registerCommand).toHaveBeenCalledTimes(Object.keys(Commands).length);
        });

        it('should clear commands on disable', async () => {
            const commandManager = new CommandManager(server);

            commandManager.getCommands().set('test', new Command({ id: 'test:test' }));
            await commandManager.disable();

            expect(commandManager.getCommands().size).toBe(0);
        });

        it('should register a command by class', async () => {
            const commandManager = new CommandManager(server);

            const command = new Command({
                id: 'test:command'
            });

            await commandManager.registerCommand(command);

            expect(commandManager.getCommands().get('test:command')).toBe(command);
        });

        /** A manager whose permission checks are observable, plus the spy watching them. */
        const managerWithPermissionSpy = (granted = true) => {
            const can = vi.fn().mockReturnValue({ execute: () => granted });
            // A working rule store rather than an empty one: the vanilla `/gamerule` reads
            // and writes through it, and `sendCommandFeedback` decides whether a success
            // message reaches the sender at all.
            const rules = new Map<string, GameRuleEntry>([
                ['sendCommandFeedback', [true, true]],
                ['fallDamage', [true, true]]
            ]);
            const gameRules = stub<GameRuleManager>({
                getGameRule: (name: string) => rules.get(name) ?? null,
                setGameRule: (name: string, value: boolean | number, editable: boolean) => {
                    rules.set(name, [value, editable]);
                }
            });
            const world = stub<World>({ getGameRuleManager: () => gameRules });
            const worldManager = stub<WorldManager>({ getDefaultWorld: () => world, getWorlds: () => [world] });

            return {
                can,
                rules,
                commandManager: new CommandManager(
                    stub<Server>({
                        ...server,
                        getPermissionManager: () => stub<PermissionManager>({ can }),
                        getWorldManager: () => worldManager
                    })
                )
            };
        };

        it('should not consult permissions for a console-issued command', async () => {
            // The console is the process operator, so it is trusted by existing rather than
            // by holding a permission node. That used to be an `isConsole()` bypass inside
            // the permission manager, which only worked because the console pretended to be
            // an entity; the trust now lives here, where the sender's kind is known.
            const { can, commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            await commandManager.dispatchCommand(console, console, '/help');

            expect(can).not.toHaveBeenCalled();
        });

        it('should consult permissions for a player-issued command, and stop on refusal', async () => {
            // The other half of the pair: dropping the console from the check must not have
            // dropped it for everyone.
            const { can, commandManager } = managerWithPermissionSpy(false);
            await commandManager.enable();

            // Prototype-only: a real player needs a live connection, and a refused command
            // returns before anything would reach for one.
            const player = stubOf(Player);
            const sendMessage = vi.spyOn(player, 'sendMessage').mockResolvedValue();

            await expect(commandManager.dispatchCommand(player, player, '/help')).resolves.toBe(false);

            // By identity: letting vitest pretty-print a prototype-only player walks into
            // `toString()`, which reaches for metadata and a world it has never been given.
            expect(can.mock.calls.length).toBe(1);
            expect(can.mock.calls[0]?.[0]).toBe(player);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('do not have permission'));
        });

        it('should register every command under the name its id gives it', async () => {
            // The client's command list is built by matching each dispatcher root literal
            // against `Command.name`, so a literal spelled differently from the id suffix
            // drops the command from the client and leaves neither spelling dispatchable.
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const root = commandManager.getDispatcher().getRoot();
            const unregistered = Array.from(commandManager.getCommands().values())
                .filter((command) => root.getChild(command.name) === undefined)
                .map((command) => command.id);
            expect(unregistered).toEqual([]);

            const names = new Set(Array.from(commandManager.getCommands().values(), (command) => command.name));
            const orphaned = commandManager
                .getCommandsList()
                .map(([literal]) => literal)
                .filter((literal) => !names.has(literal));
            expect(orphaned).toEqual([]);
        });

        it('should list each command once, with the overloads of every branch', async () => {
            // The client keys commands by name. One entry per top-level argument node, which
            // is what the tree walk used to produce, sent `/ban` three times and left the
            // client with whichever copy it read last.
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const list = commandManager.getCommandsList();
            const names = list.map(([name]) => name);
            expect(new Set(names).size).toBe(names.length);

            const overloadsOf = (name: string) => list.find(([literal]) => literal === name)?.[2];
            // `/ban <player>` and `/ban <player> <reason>`.
            expect(overloadsOf('ban')?.map((overload) => overload.length)).toEqual([1, 2]);
            // `/version` runs bare and takes nothing else.
            expect(overloadsOf('version')).toEqual([[]]);
        });

        it('should keep the vanilla set out of the class-registered list', async () => {
            // A name belongs to exactly one of the two trees. A vanilla command that was
            // also still registered as a class would reach the client twice over.
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const classes = commandManager.getCommandsList().map(([name]) => name);
            const vanilla = commandManager.getVanillaCommandList().map((command) => command.name);

            expect(classes.filter((name) => vanilla.includes(name))).toEqual([]);
            expect(vanilla).toContain('teleport');
            expect(vanilla).toContain('time');
        });

        it('should flatten nested literals and redirect targets into hard enums', () => {
            const commandManager = new CommandManager(server);
            const dispatcher = commandManager.getDispatcher();
            const destination = dispatcher.register(
                literal('destination').then(literal('child').then(argument('value', integer()).executes(() => 0)))
            );
            dispatcher.register(
                literal('nested').then(literal('sub').then(argument('value', integer()).executes(() => 0)))
            );
            dispatcher.register(literal('alias').redirect(destination));

            const overloadsOf = (name: string) =>
                commandManager.getCommandsList().find(([entry]) => entry === name)?.[2];
            const nestedKeyword = overloadsOf('nested')?.[0]?.[0];
            const redirectedKeyword = overloadsOf('alias')?.[0]?.[0];

            if (!nestedKeyword || !isCommandArgument(nestedKeyword)) throw new Error('Expected a literal parameter');
            if (!redirectedKeyword || !isCommandArgument(redirectedKeyword))
                throw new Error('Expected a redirected literal parameter');

            const [nestedParameter] = nestedKeyword.getParameters();
            const [redirectedParameter] = redirectedKeyword.getParameters();
            expect(nestedParameter?.enum?.values).toEqual(['sub']);
            expect(nestedParameter?.enum?.soft).toBe(false);
            expect(nestedParameter?.flags).toBe(CommandParameterFlags.FORCE_COLLAPSE_ENUM);
            expect(redirectedParameter?.enum?.values).toEqual(['child']);
            expect(redirectedParameter?.enum?.soft).toBe(false);
        });

        it('should dispatch a vanilla command through the command layer', async () => {
            // `/gamerule <rule>` reads through the host, so the value reaching the console
            // proves the vanilla tree parsed it and the host answered.
            const { commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/gamerule fall_damage true')).resolves.toBe(
                true
            );
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('minecraft:fall_damage = true'));
        });

        it('should refuse a vanilla command whose subsystem is missing', async () => {
            // `/effect` is not registered at all, so the client is never offered it and the
            // dispatcher reports it unknown rather than accepting it and doing nothing.
            const { commandManager } = managerWithPermissionSpy();
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/effect give @s speed')).resolves.toBe(
                false
            );
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
        });

        it('should resolve to true once a command has run', async () => {
            // `CommandRequestHandler` reports this to the client as the reply's success count.
            const { commandManager } = managerWithPermissionSpy();
            const runs: string[] = [];

            class PingCommand extends Command {
                public constructor() {
                    super({ id: 'test:ping' });
                }

                public async register(dispatcher: CommandDispatcher<CommandExecutor>): Promise<void> {
                    dispatcher.register(
                        literal('ping').executes((context) => {
                            runs.push(context.getInput());
                            return 'pong';
                        })
                    );
                }
            }
            await commandManager.registerCommand(new PingCommand());

            const console = new Console(server);
            await expect(commandManager.dispatchCommand(console, console, '/ping')).resolves.toBe(true);
            expect(runs).toEqual(['ping']);
        });

        it('should refuse an unknown command without throwing at the caller', async () => {
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/nope')).resolves.toBe(false);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
        });

        describe('permission config integration', () => {
            let directory: string;

            beforeEach(() => {
                directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-command-permission-test-'));
                vi.stubEnv('JSP_DIR', directory);
            });

            afterEach(() => {
                vi.unstubAllEnvs();
                rmSync(directory, { recursive: true, force: true });
            });

            it('lets the default UUID owner run /op and persists the target UUID', async () => {
                const ownerUuid = 'fbf8646c-652c-38c4-96ff-a29d86cb5943';
                const targetUuid = '00000000-0000-0000-0000-000000000007';
                const logger = stub<Logger>({
                    debug: () => {},
                    verbose: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {}
                });
                const target = stubOf(Player, {
                    getName: () => 'Target',
                    getUUID: () => UUID.fromString(targetUuid),
                    getNetworkSession: () =>
                        stub<ReturnType<Player['getNetworkSession']>>({ sendAvailableCommands: async () => {} }),
                    getServer: () => server,
                    sendSettings: async () => {}
                });
                const sessionManager = stub<SessionManager>({
                    getAllPlayers: () => [],
                    getPlayerByExactName: (name) => (name === 'Target' ? target : undefined)
                });
                const permissionManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    post: () => 0
                });
                const console = stub<Console>({
                    getName: () => 'Console',
                    getFormattedUsername: () => 'Console',
                    getServer: () => server,
                    sendMessage: () => {}
                });
                const world = stub<World>({
                    getGameRuleManager: () => stub<GameRuleManager>({ getGameRule: () => [true, true] })
                });
                const server = stub<Server>({
                    emit: async () => {},
                    post: () => 0,
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    getPermissionManager: () => permissionManager,
                    getConsole: () => console,
                    getChatManager: () => stub<ChatManager>({ send: async () => {} })
                });
                const permissionOwner = stub<Player>({
                    getName: () => 'Filfat',
                    getUUID: () => UUID.fromString(ownerUuid),
                    isOp: () => false,
                    getPermissions: () => []
                });

                await permissionManager.enable();
                const grants = await permissionManager.getPermissions(permissionOwner);
                const owner = stubOf(Player, {
                    getName: () => 'Filfat',
                    getUUID: () => UUID.fromString(ownerUuid),
                    getRuntimeId: () => 1n,
                    getPermissions: () => grants,
                    isOp: () => permissionManager.isOp(ownerUuid),
                    getWorld: () => world,
                    getServer: () => server,
                    sendMessage: async () => {}
                });
                const commandManager = new CommandManager(server);
                await commandManager.enable();

                await expect(commandManager.dispatchCommand(owner, owner, '/op Target')).resolves.toBe(true);

                expect(permissionManager.isOp(targetUuid)).toBe(true);
                expect(permissionManager.isOp('Target')).toBe(false);

                const reloadedManager = new PermissionManager({
                    getLogger: () => logger,
                    getSessionManager: () => sessionManager,
                    post: () => 0
                });
                await reloadedManager.enable();
                expect(reloadedManager.isOp(targetUuid)).toBe(true);
            });
        });
    });
});
