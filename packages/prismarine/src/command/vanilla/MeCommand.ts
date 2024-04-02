import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal } from '@jsprismarine/brigadier';

import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import { Command } from '../Command';
import type Player from '../../Player';

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
