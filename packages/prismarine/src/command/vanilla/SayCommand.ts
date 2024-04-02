import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal } from '@jsprismarine/brigadier';

import Chat from '../../chat/Chat';
import { Command } from '../Command';
import type Player from '../../Player';

export default class SayCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:say',
            description: 'Say something to all players.',
            permission: 'minecraft.command.say'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('say').then(
                argument('message', greedyString()).executes(async (context) => {
                    const source = context.getSource() as Player;
                    const message = context.getArgument('message') as string;

                    const chat = new Chat(source, `§5[${source.getName()}] ${message}`);
                    await source.getServer().getChatManager().send(chat);
                })
            )
        );
    }
}
