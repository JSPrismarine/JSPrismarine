import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import Command from '../Command';
import Player from '../../player/Player';

export default class MeCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:me',
            description: 'Displays custom message in chat.',
            permission: 'minecraft.command.me'
        });
    }

    public async execute(sender: Player, args: Array<string | number>) {
        if (!args[0]) {
            return sender.sendMessage(`§cPlease specify a message.`);
        }

        const message = args.join(' ');
        const messageToSend = `*${sender.getUsername()}: ${message}`;

        const event = new ChatEvent(new Chat(sender, messageToSend));
        await sender.getServer().getEventManager().emit('chat', event);
    }
}
