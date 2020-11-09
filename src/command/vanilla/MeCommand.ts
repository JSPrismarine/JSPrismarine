import Command from '../Command';
import Player from '../../player/Player';

class MeCommand extends Command {
    constructor() {
        // TODO: add permissions to command
        super({
            id: 'minecraft:me',
            description: 'Displays custom message in chat.',
            permission: 'minecraft.command.me'
        });
    }

    execute(sender: Player, args: Array<string>) {
        if (!args[0]) {
            return sender.sendMessage(`§cPlease specify a message.`);
        }

        let message = args.join(' ');
        let messageToSend = `*${sender.getUsername()}: ${message}`;

        sender.getServer().getLogger().info(messageToSend);
        for (let player of sender.getServer().getOnlinePlayers()) {
            player.sendMessage(messageToSend);
        }
    }
}

module.exports = MeCommand;
