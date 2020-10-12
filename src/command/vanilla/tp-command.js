const Command = require('../command');
const Player = require('../../player/player').default;
const logger = require('../../utils/logger');
const ConsoleSender = require('../console-sender');
const Gamemode = require('../../world/gamemode');

class GamemodeCommand extends Command {

    constructor() {
        super({ namespace: 'minecraft', name: 'tp', description: 'Teleports a player to a specified location' });
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args
     */
    execute(sender, args) {
        if (args.length !== 4) {
            return sender.sendMessage('§cYou have to specify <user> x y z.');
        }

        // TODO: handle only supplying x y, and relative teleport

        const target = sender.getServer().getPlayerByName(args[0]);
        if (!target)
            return sender.sendMessage(`§c${args[0]} is not online!`);

        target.x = args[1];
        target.y = args[2];
        target.z = args[3];
        target.broadcastMove(target);
        return sender.sendMessage(`Teleported ${args[0]} to ${target.x} ${target.y} ${target.z}`);
    }
}
module.exports = GamemodeCommand;
