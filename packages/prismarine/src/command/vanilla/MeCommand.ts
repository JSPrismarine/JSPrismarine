import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { greedyString } from '@jsprismarine/brigadier';

import { Chat } from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command, argument, asyncCommand, literal } from '../Command';
import { getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class MeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:me',
            description: 'Displays custom message in chat.',
            permission: 'minecraft.command.me'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('me').then(
                argument('message', greedyString()).executes(
                    asyncCommand(async (context) => {
                        const source = context.getSource();
                        const message = getString(context, 'message');
                        const messageToSend = `*${source.getName()}: ${message}`;

                        const event = new ChatEvent(
                            new Chat({
                                sender: source,
                                message: messageToSend
                            })
                        );
                        await source.getServer().emit('chat', event);
                    })
                )
            )
        );
    }
}
