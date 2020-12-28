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

    public async execute(sender: Player, args: string[]) {
        if (!args[0]) {
            return sender.sendMessage(`§cPlease specify a message.`);
        }

        const message = args.join(' ');
        const messageToSend = `*${sender.getUsername()}: ${message}`;

        sender.getServer().getLogger().info(messageToSend);
        for (const player of sender.getServer().getOnlinePlayers()) {
            await player.sendMessage(messageToSend);
        }
    }
}
