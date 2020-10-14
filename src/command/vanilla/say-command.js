const Command = require('../Command').default;
const Player = require('../../player').default;
const Logger = require('../../utils/Logger');

class SayCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({ namespace: 'minecraft', name: 'say', description: 'Say something to all players.' });
    }

    /**
     * @param {Player} sender
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
