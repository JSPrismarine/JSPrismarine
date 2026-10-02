import { describe, expect, it, vi } from 'vitest';
import type { Server } from '../';
import Console from '../Console';
import Player from '../Player';
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

            (commandManager as any).commands.set('test', new Command({} as any));
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
            const worldManager = {
                getDefaultWorld: () => ({ getGameRuleManager: () => ({ getGameRule: () => false }) })
            };

            return {
                can,
                commandManager: new CommandManager({
                    ...server,
                    getPermissionManager: () => ({ can }),
                    getWorldManager: () => worldManager
                } as unknown as Server)
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
            const player = Object.create(Player.prototype) as Player;
            const sendMessage = vi.spyOn(player, 'sendMessage').mockResolvedValue();

            await commandManager.dispatchCommand(player, player, '/help');

            // By identity: letting vitest pretty-print a prototype-only player walks into
            // `toString()`, which reaches for metadata and a world it has never been given.
            expect(can.mock.calls.length).toBe(1);
            expect(can.mock.calls[0]?.[0]).toBe(player);
            expect(sendMessage).toHaveBeenCalledWith(expect.stringContaining('do not have permission'));
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
