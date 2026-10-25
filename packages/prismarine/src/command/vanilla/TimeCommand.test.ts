import { CommandDispatcher } from '@jsprismarine/brigadier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Player from '../../Player';
import { stub, stubOf } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type { CommandExecutor } from '../CommandExecutor';
import TimeCommand from './TimeCommand';
import { collectAsyncCommands } from '../Command';

describe('command', () => {
    describe('TimeCommand', () => {
        let dispatcher: CommandDispatcher<CommandExecutor>;
        let player: Player;
        let world: World;

        beforeEach(() => {
            dispatcher = new CommandDispatcher();
            player = stubOf(Player);
            world = stub<World>({
                getTicks: vi.fn(),
                setTicks: vi.fn(),
                sendTime: vi.fn()
            });
            vi.spyOn(player, 'getWorld').mockReturnValue(world);
            vi.spyOn(player, 'sendMessage').mockResolvedValue();
        });

        it('should register the time command', async () => {
            const timeCommand = new TimeCommand();
            await timeCommand.register(dispatcher);

            const command = dispatcher.parse('time', player);
            expect(command.getContext().getNodes()[0]?.getNode().getName()).toBe('time');
        });

        it('should get the current time', async () => {
            const timeCommand = new TimeCommand();
            await timeCommand.register(dispatcher);

            vi.mocked(world.getTicks).mockReturnValue(1000);

            await Promise.all(collectAsyncCommands(() => dispatcher.execute('time', player)));

            expect(player.sendMessage).toHaveBeenCalledWith('The current time is 1000');
        });
    });
});
