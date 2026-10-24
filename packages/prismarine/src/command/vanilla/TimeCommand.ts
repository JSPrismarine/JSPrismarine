import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { integer, string } from '@jsprismarine/brigadier';

import Player from '../../Player';
import { Command, argument, literal } from '../Command';
import { getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class TimeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:time',
            description: 'Get, set and add to the current time.',
            permission: 'minecraft.command.time'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('time')
                .then(
                    argument('action', string()).then(
                        argument('value', integer()).executes(async (context) => {
                            const source = context.getSource();
                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            const world = source.getWorld();

                            const value = context.getArgument('value');
                            if (value < 0) throw new Error('value can not be less than 0');

                            const action = getString(context, 'action');
                            switch (action.toLowerCase()) {
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
                                    throw new Error(`Invalid argument "${action}"`);
                            }

                            await world.sendTime();
                            await source.sendMessage(`Set time to: ${world.getTicks()}`);
                            return `Set time to: ${world.getTicks()}`;
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource();
                    if (!(source instanceof Player)) throw new Error(`This command can't be run from the console`);

                    const world = source.getWorld();

                    await source.sendMessage(`The current time is ${world.getTicks()}`);
                })
        );
    }
}
