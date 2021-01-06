/* eslint-disable promise/prefer-await-to-then */
import {
    CommandDispatcher,
    argument,
    literal,
    string,
    integer
} from '@jsprismarine/brigadier';
import Command from '../Command';
import Player from '../../player/Player';

export default class TimeCommand extends Command {
    constructor() {
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
                        argument('value', integer()).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const world =
                                    source.getWorld?.() ||
                                    source
                                        .getServer()
                                        .getWorldManager()
                                        .getDefaultWorld();

                                switch (
                                    context.getArgument('action').toLowerCase()
                                ) {
                                    case 'set':
                                        world.setTicks(
                                            context.getArgument('value')
                                        );
                                        break;
                                    case 'add':
                                        world.setTicks(
                                            world.getTicks() +
                                                context.getArgument('value')
                                        );
                                        break;
                                    case 'sub':
                                        world.setTicks(
                                            world.getTicks() -
                                                context.getArgument('value')
                                        );
                                        break;
                                    default:
                                        throw new Error(
                                            `Invalid argument "${context.getArgument(
                                                'action'
                                            )}"`
                                        );
                                }

                                await world.sendTime();
                                await source.sendMessage(
                                    `Set time to: ${world.getTicks()}`
                                );
                                return `Set time to: ${world.getTicks()}`;
                            }
                        )
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource() as Player;
                    const world =
                        source.getWorld?.() ||
                        source.getServer().getWorldManager().getDefaultWorld();

                    await source.sendMessage(
                        `The current time is ${world.getTicks()}`
                    );
                })
        );
    }
}
