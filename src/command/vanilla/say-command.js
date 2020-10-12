const Command = require('../command');
const Player = require('../../player/player').default;
const ConsoleSender = require('../console-sender');
const Logger = require('../../utils/logger');

class SayCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({ namespace: 'minecraft', name: 'say', description: 'Say something to all players.' });
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        if (!args[0]) {
            return sender.sendMessage(`§cPlease specify a message.`);
        }

        let message = args.join(' ');
        let messageToSend = `§5[${sender.name}] ${message}`;

        Logger.info(messageToSend);
        for (let player of sender.getServer().getOnlinePlayers()) {
            player.sendMessage(messageToSend);
        }
        return null;
    }
}

module.exports = SayCommand;
