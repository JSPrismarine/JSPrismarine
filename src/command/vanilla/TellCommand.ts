import Player from '../../player/Player';
import Command from '../Command';

export default class TellCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:tell',
            description: 'Sends a private message to a player.'
        } as any);
    }

    execute(sender: Player, args: Array<string>) {
        if (!args[0]) {
            return sender.sendMessage('§cYou have to select a player.');
        }

        if (`${args[0]}`.toLowerCase() == sender.getUsername().toLowerCase()) {
            return sender.sendMessage("§cYou can't send message to yourself.");
        }

        if (!args[1]) {
            return sender.sendMessage('§cPlease specify a message.');
        }

        let targetPlayer = sender.getServer().getPlayerByName(args[0]);

        if (!targetPlayer) {
            return sender.sendMessage(`§cCan't find the player ${args[0]}.`);
        }

        let message = args.splice(1).join(' ');
        let messageToSend = `§e[§f${sender.getUsername()} §e->§f ${targetPlayer.getUsername()}§e]§f ${message}`;

        sender.sendMessage(messageToSend);
        return targetPlayer.sendMessage(messageToSend);
    }
}
