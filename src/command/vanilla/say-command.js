const Command = require('../').default;
const Player = require('../../player').default;

class SayCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({ id: 'minecraft:say', description: 'Say something to all players.' });
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

        sender.getServer().getLogger().info(messageToSend);
        for (let player of sender.getServer().getOnlinePlayers()) {
            player.sendMessage(messageToSend);
        }
        return null;
    }
}

module.exports = SayCommand;
