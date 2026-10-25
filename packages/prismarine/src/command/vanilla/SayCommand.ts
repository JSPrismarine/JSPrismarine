import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { greedyString } from '@jsprismarine/brigadier';

import { Chat } from '../../chat/Chat';
import { Command, argument, asyncCommand, literal } from '../Command';
import { getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class SayCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:say',
            description: 'Say something to all players.',
            permission: 'minecraft.command.say'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('say').then(
                argument('message', greedyString()).executes(
                    asyncCommand(async (context) => {
                        const source = context.getSource();
                        const message = getString(context, 'message');

                        const chat = new Chat({ sender: source, message: `§5[${source.getName()}] ${message}` });
                        await source.getServer().getChatManager().send(chat);
                    })
                )
            )
        );
    }
}
