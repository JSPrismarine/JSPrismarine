import Command from '../Command';
import type Player from '../../player/Player';

export default class ListCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:list',
            description: 'Lists players on the server.'
        });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    execute(sender: Player, args: Array<string>) {
        let players = sender.getServer().getOnlinePlayers();
        let playerArray = Array.from(players);
        let maxPlayers = sender
            .getServer()
            .getRaknet()
            .name.getMaxPlayerCount();
        let counter = playerArray.length;
        let answer = playerArray
            .map((player) => player.getUsername())
            .join(', ');

        sender.sendMessage(
            `There are ${counter}/${maxPlayers} players online:`
        );
        if (answer) sender.sendMessage(answer);
    }
}
