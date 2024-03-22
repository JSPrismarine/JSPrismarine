import { CommandDispatcher, argument, integer, literal, string } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../Player';

export default class TimeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:time',
            description: 'Get, set and add to the current time.',
            permission: 'minecraft.command.time'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('time')
                .then(
                    argument('action', string()).then(
                        argument('value', integer()).executes(async (context) => {
                            const source = context.getSource() as Player;
                            const world = source.getWorld?.() || source.getServer().getWorldManager().getDefaultWorld();

                            const value = context.getArgument('value');
                            if (value < 0) throw new Error('value can not be less than 0');

                            switch (context.getArgument('action').toLowerCase()) {
                                case 'set':
                                    world.setTicks(value);
                                    break;
                                case 'add':
                                    world.setTicks(world.getTicks() + value);
                                    break;
                                case 'sub':
                                    world.setTicks(world.getTicks() - value);
                                    break;
                                default:
                                    throw new Error(`Invalid argument "${context.getArgument('action')}"`);
                            }

                            await world.sendTime();
                            await source.sendMessage(`Set time to: ${world.getTicks()}`);
                            return `Set time to: ${world.getTicks()}`;
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource() as Player;
                    const world = source.getWorld?.() || source.getServer().getWorldManager().getDefaultWorld();

                    await source.sendMessage(`The current time is ${world.getTicks()}`);
                })
        );
    }
}
