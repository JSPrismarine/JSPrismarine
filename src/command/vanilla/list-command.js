const Command = require('../').default;
const Player = require('../../player/Player').default;

class ListCommand extends Command {

    constructor() {
        super({ id: 'minecraft:list', description: 'Lists players on the server.' });
    }

    /**
     * @param {Player} sender 
     * @param {Array} args 
     */
    execute(sender, args) {
        let players = sender.getServer().getOnlinePlayers();
        let playerArray = Array.from(players);
        let maxPlayers = sender.getServer().getRaknet().name.getMaxPlayerCount();
        let counter = playerArray.length;
        let answer = playerArray.map(player => player.name).join(', ');

        sender.sendMessage(`There are ${counter}/${maxPlayers} players online:`);
        if (answer)
            sender.sendMessage(answer);
    }
}

module.exports = ListCommand;
