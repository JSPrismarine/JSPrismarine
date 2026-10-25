import { CommandDispatcher } from '@jsprismarine/brigadier';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type BanManager from '../../ban/BanManager';
import type SessionManager from '../../SessionManager';
import { stub } from '../../testing/stub.test.helper';
import type { CommandExecutor } from '../CommandExecutor';
import BanCommand from './BanCommand';
import { collectAsyncCommands } from '../Command';

describe('command', () => {
    describe('vanilla', () => {
        describe('BanCommand', () => {
            let dispatcher: CommandDispatcher<CommandExecutor>;
            let setBanned: ReturnType<typeof vi.fn<BanManager['setBanned']>>;
            let kick: ReturnType<typeof vi.fn<Player['kick']>>;
            let source: CommandExecutor;

            beforeEach(async () => {
                setBanned = vi.fn<BanManager['setBanned']>(async () => true);
                kick = vi.fn<Player['kick']>(async () => {});

                const target = stub<Player>({
                    getName: () => 'testPlayer',
                    getFormattedUsername: () => 'testPlayer',
                    kick
                });
                const server = stub<Server>({
                    getBanManager: () => stub<BanManager>({ setBanned }),
                    getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => [target] })
                });
                source = {
                    sendMessage: () => {},
                    getName: () => 'console',
                    getFormattedUsername: () => 'console',
                    getServer: () => server
                };

                dispatcher = new CommandDispatcher();
                await new BanCommand().register(dispatcher);
            });

            it('should have correct properties', () => {
                const banCommand = new BanCommand();
                expect(banCommand.id).toBe('minecraft:ban');
                expect(banCommand.description).toBe('Ban a player.');
                expect(banCommand.permission).toBe('minecraft.command.ban');
            });

            it('should ban a player with reason', async () => {
                await Promise.all(collectAsyncCommands(() => dispatcher.execute('ban testPlayer testReason', source)));

                expect(kick).toHaveBeenCalledWith('You have been banned from the server due to: \n\ntestReason!');
                expect(setBanned).toHaveBeenCalledWith('testPlayer', 'testReason');
            });

            it('should ban a player without reason', async () => {
                await Promise.all(collectAsyncCommands(() => dispatcher.execute('ban testPlayer', source)));

                expect(kick).toHaveBeenCalledWith('You have been banned!');
                expect(setBanned).toHaveBeenCalledWith('testPlayer');
            });
        });
    });
});
