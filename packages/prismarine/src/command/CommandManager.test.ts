import { describe, expect, it, vi } from 'vitest';
import { CommandManager, Command, Commands } from './';
import type { Server } from '../';

describe('command', () => {
    describe('CommandManager', () => {
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {}
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
            await commandManager.onEnable();

            expect(commandManager.registerCommand).toHaveBeenCalledTimes(Object.keys(Commands).length);
        });

        it('should clear commands on disable', async () => {
            const commandManager = new CommandManager(server);

            (commandManager as any).commands.set('test', new Command({} as any));
            await commandManager.onDisable();

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
    });
});
