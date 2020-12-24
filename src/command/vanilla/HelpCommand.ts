import Chat from '../../chat/Chat';
import Command from '../Command';
import type Player from '../../player/Player';

export default class HelpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:help',
            description: 'Get helpful information about commands.',
            aliases: ['?']
        } as any);
    }

    execute(sender: Player, args: Array<string>) {
        const commands: Array<string> = [];
        sender
            .getServer()
            .getCommandManager()
            .getCommands()
            .forEach((command) => {
                commands.push(
                    `§e${command.id.split(':')[1]}§r: §7${command.description}`
                );
            });

        const chat = new Chat(
            sender,
            `§5[${sender.getUsername()}] ${commands.join('\n')}`
        );
        sender.getServer().getChatManager().send(chat);
        return;
    }
}
