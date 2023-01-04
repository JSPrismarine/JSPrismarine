import { CommandDispatcher, argument, greedyString, literal } from '@jsprismarine/brigadier';

import Chat from '../../chat/Chat.js';
import ChatEvent from '../../events/chat/ChatEvent.js';
import Command from '../Command.js';
import Player from '../../Player.js';

export default class MeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:me',
            description: 'Displays custom message in chat.',
            permission: 'minecraft.command.me'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('me').then(
                argument('message', greedyString()).executes(async (context) => {
                    const source = context.getSource() as Player;
                    const message = context.getArgument('message') as string;
                    const messageToSend = `*${source.getName()}: ${message}`;

                    const event = new ChatEvent(new Chat(source, messageToSend));
                    await source.getServer().getEventManager().emit('chat', event);
                })
            )
        );
    }
}
