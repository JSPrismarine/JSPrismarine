import { describe, expect, it, vi } from 'vitest';
import type { Server } from '../';
import Console from '../Console';
import Player from '../Player';
import type { PermissionManager } from '../permission/PermissionManager';
import { stub, stubOf } from '../testing/stub.test.helper';
import type GameRuleManager from '../world/GameRuleManager';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import * as Commands from './Commands';
import { Command } from './Command';
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
            // An unset rule keeps command feedback off, so the double needs no chat manager.
            const gameRules = stub<GameRuleManager>({ getGameRule: () => null });
            const world = stub<World>({ getGameRuleManager: () => gameRules });
            const worldManager = stub<WorldManager>({ getDefaultWorld: () => world });

            return {
                can,
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

            await commandManager.dispatchCommand(player, player, '/help');

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

        it('should dispatch /gamerule to its executor', async () => {
            // The executor refuses non-player sources, and that refusal reaching the
            // console proves the dispatcher found the command under the name `/help` lists.
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await commandManager.dispatchCommand(console, console, '/gamerule');

            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining("can't be run from the console"));
        });

        it('should refuse an unknown command without throwing at the caller', async () => {
            const commandManager = new CommandManager(server);
            await commandManager.enable();

            const console = new Console(server);
            const sendMessage = vi.spyOn(console, 'sendMessage').mockImplementation(() => {});

            await expect(commandManager.dispatchCommand(console, console, '/nope')).resolves.toBeUndefined();
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
        });
    });
});
