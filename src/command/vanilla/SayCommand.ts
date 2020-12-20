import Chat from '../../chat/Chat';
import Command from '../Command';
import type Player from '../../player/Player';

export default class SayCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:say',
            description: 'Say something to all players.',
            permission: 'minecraft.command.say'
        } as any);
    }

    execute(sender: Player, args: Array<string>) {
        if (!args[0]) {
            return sender.sendMessage(`§cPlease specify a message.`);
        }

        let message = args.join(' ');
        const chat = new Chat(sender, `§5[${sender.getUsername()}] ${message}`);
        sender.getServer().getChatManager().send(chat);
        return;
    }
}
