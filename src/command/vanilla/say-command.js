const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')
const Logger = require('../../utils/logger')

'use strict'

class SayCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({name: 'say', description: 'Say!'})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        if (!args[0]) {
            return sender.sendMessage(`§cInvalid message.`)
        }

        let message = args.join(' ')

        let messageToSend = `${sender instanceof ConsoleSender ? '§d' : ''}[${sender.name}] ${message}`
        Logger.silly(messageToSend)
        for (let player of sender.getServer().players.values()) {
            player.sendMessage(messageToSend)
        }
    }
}

module.exports = SayCommand