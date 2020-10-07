const Command = require('../command');
const Player = require('../../player');
const ConsoleSender = require('../console-sender');
const Logger = require('../../utils/logger');

'use strict';

class MeCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({ namespace: 'minecraft', name: 'me', description: 'Displays custom message in chat.' });
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
        let messageToSend = `*${sender.name}: ${message}`;

        Logger.info(messageToSend);
        for (let player of sender.getServer().getOnlinePlayers()) {
            player.sendMessage(messageToSend);
        }
        return null;
    }
}

module.exports = MeCommand;
