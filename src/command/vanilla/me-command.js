const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')
const Logger = require('../../utils/logger')

'use strict'

class MeCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({name: 'me', description: 'Me!'})
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

        let messageToSend = `§5*${sender.name}: ${message}`
        Logger.silly(messageToSend)
        for (let player of sender.getServer().players.values()) {
            player.sendMessage(messageToSend)
        }
    }
}

module.exports = MeCommand