import { describe, expect, it, vi } from 'vitest';
import CommandManager from './CommandManager';
import * as Commands from './Commands';
import { Command } from './Command';
import type Server from '../Server';

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
            getEventManager: () => ({
                emit: () => {}
            })
        }))();

        it('should register commands on enable', async () => {
            const commandManager = new CommandManager(server);

            // Mock the registerClassCommand method
            commandManager.registerClassCommand = vi.fn();
            await commandManager.onEnable();

            expect(commandManager.registerClassCommand).toHaveBeenCalledTimes(Object.keys(Commands).length);
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

            await commandManager.registerClassCommand(command);

            expect(commandManager.getCommands().get('test:command')).toBe(command);
        });
    });
});
