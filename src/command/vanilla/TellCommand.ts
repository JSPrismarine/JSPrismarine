import Command from '../Command';
import Player from '../../player/Player';

export default class TellCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:tell',
            description: 'Sends a private message to a player.'
        } as any);
    }

    public async execute(sender: Player, args: Array<string | number>) {
        if (!args[0]) {
            return sender.sendMessage('§cYou have to select a player.');
        }

        if (`${args[0]}`.toLowerCase() === sender.getUsername().toLowerCase()) {
            return sender.sendMessage("§cYou can't send message to yourself.");
        }

        if (!args[1]) {
            return sender.sendMessage('§cPlease specify a message.');
        }

        const targetPlayer = sender.getServer().getPlayerByName(`${args[0]}`);

        if (!targetPlayer) {
            return sender.sendMessage(`§cCan't find the player ${args[0]}.`);
        }

        const message = args.splice(1).join(' ');
        const messageToSend = `§e[§f${sender.getUsername()} §e->§f ${targetPlayer.getUsername()}§e]§f ${message}`;

        await sender.sendMessage(messageToSend);
        await targetPlayer.sendMessage(messageToSend);
    }
}
