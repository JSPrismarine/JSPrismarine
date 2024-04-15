import { describe, expect, it, vi } from 'vitest';

import BanCommand from './BanCommand';

describe('command', () => {
    describe('vanilla', () => {
        describe.skip('BanCommand', () => {
            const mockExecute = vi.fn().mockImplementation(() => Promise.resolve());

            const dispatcher = {
                register: vi.fn().mockImplementation((command) => {
                    command.execute = mockExecute;
                })
            };

            const banManager = {
                setBanned: vi.fn()
            };

            const playerRes = {
                getName: vi.fn().mockReturnValue('testPlayer'),
                getServer: vi.fn().mockReturnValue({
                    getSessionManager: vi.fn().mockReturnValue({
                        getAllPlayers: vi.fn().mockReturnValue([
                            {
                                getName: vi.fn().mockReturnValue('testPlayer')
                            }
                        ])
                    }),
                    getLogger: vi.fn().mockReturnValue({
                        error: vi.fn()
                    })
                }),
                kick: vi.fn()
            };
            const player = {
                getServer: vi.fn().mockReturnValue({
                    getBanManager: vi.fn().mockReturnValue(banManager),
                    getSessionManager: vi.fn().mockReturnValue({
                        getAllPlayers: vi.fn().mockReturnValue([playerRes])
                    }),
                    getLogger: vi.fn().mockReturnValue({
                        error: vi.fn()
                    })
                })
            };

            const context = {
                getSource: vi.fn().mockReturnValue(player),
                getArgument: vi.fn().mockImplementation((argName) => {
                    if (argName === 'player') {
                        return 'testPlayer';
                    } else if (argName === 'reason') {
                        return 'testReason';
                    }

                    return '';
                })
            };

            it('should have correct properties', () => {
                const banCommand = new BanCommand();
                expect(banCommand.id).toBe('minecraft:ban');
                expect(banCommand.description).toBe('Ban a player.');
                expect(banCommand.permission).toBe('minecraft.command.ban');
            });

            it('should ban a player with reason', async () => {
                // Create an instance of BanCommand
                const banCommand = new BanCommand();

                // Call the register method with the mock dispatcher
                await banCommand.register(dispatcher as any);

                // Call the execute method with the mock context
                await dispatcher.register.mock.calls[0][0].execute(context);

                // Assertions
                /*expect(playerRes.kick).toHaveBeenCalledWith(
                    'You have been banned from the server due to: \n\ntestReason!'
                );*/
                expect(banManager.setBanned).toHaveBeenCalledWith('testPlayer', 'testReason');
            });

            it('should ban a player without reason', async () => {
                // Create a mock context
                const context = {
                    getSource: vi.fn().mockReturnValue(player),
                    getArgument: vi.fn().mockImplementation((argName) => {
                        if (argName === 'player') {
                            return 'testPlayer';
                        }

                        return '';
                    })
                };

                // Create an instance of BanCommand
                const banCommand = new BanCommand();

                // Call the register method with the mock dispatcher
                await banCommand.register(dispatcher as any);

                // Call the execute method with the mock context
                await dispatcher.register.mock.calls[0][0].execute(context);

                // Assertions
                //expect(playerRes.kick).toHaveBeenCalledWith('You have been banned!');
                expect(banManager.setBanned).toHaveBeenCalledWith('testPlayer');
            });
        });
    });
});
