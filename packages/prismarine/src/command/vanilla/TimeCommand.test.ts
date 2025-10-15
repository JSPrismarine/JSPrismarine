import { CommandDispatcher } from '@jsprismarine/brigadier';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Player from '../../Player';
import TimeCommand from './TimeCommand';

describe('command', () => {
    describe('TimeCommand', () => {
        let dispatcher: CommandDispatcher<any>;
        let player: Player;
        let world: any;

        beforeEach(() => {
            dispatcher = new CommandDispatcher();
            player = {
                getWorld: vi.fn(),
                sendMessage: vi.fn()
            } as unknown as Player;
            world = {
                getTicks: vi.fn(),
                setTicks: vi.fn(),
                sendTime: vi.fn()
            };
            (player.getWorld as ReturnType<typeof vi.fn>).mockReturnValue(world);
        });

        it('should register the time command', async () => {
            const timeCommand = new TimeCommand();
            await timeCommand.register(dispatcher);

            const command = dispatcher.parse('time', player);
            expect(command.getContext().getNodes()[0].getNode().getName()).toBe('time');
        });

        it('should get the current time', async () => {
            const timeCommand = new TimeCommand();
            await timeCommand.register(dispatcher);

            world.getTicks.mockReturnValue(1000);

            await dispatcher.execute('time', player);

            expect(player.sendMessage).toHaveBeenCalledWith('The current time is 1000');
        });
    });
});
