/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal, string } from '@jsprismarine/brigadier';

import Chat from '../../chat/Chat';
import Command from '../Command';
import Player from '../../player/Player';

export default class GameruleCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:gamerule',
            description: 'Set gamerule value.',
            permission: 'minecraft.command.gamerule'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('gamerule').then(
                argument('name', string()).then(
                    argument('value', string()).executes(async (context) => {
                        const source = context.getSource() as Player;
                        const name = context.getArgument('name');
                        let value = context.getArgument('value').toLowerCase();

                        if (value === 'true') value = true;
                        if (value === 'false') value = false;

                        source.getWorld().getGameruleManager().setGamerule(name, value);
                        // TODO: notify clients about gamerule change

                        const chat = new Chat(source, `§5[${source.getName()}] set ${name} to ${value}`);
                        await source.getServer().getChatManager().send(chat);
                    })
                )
            )
        );
    }
}
