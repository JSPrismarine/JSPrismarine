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
    public async execute(sender: Player, args: string[]) {
        const players = sender.getServer().getOnlinePlayers();
        const playerArray = Array.from(players);
        const maxPlayers = sender
            .getServer()
            .getRaknet()
            .getName()
            .getMaxPlayerCount();
        const counter = playerArray.length;
        const answer = playerArray
            .map((player) => player.getUsername())
            .join(', ');

        await sender.sendMessage(
            `There are ${counter}/${maxPlayers} players online:`
        );
        if (answer) await sender.sendMessage(answer);
    }
}
