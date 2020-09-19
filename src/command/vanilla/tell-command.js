const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

'use strict'

class TellCommand extends Command {

    constructor() {
        super({name: 'tell', description: 'Tell a message to a player.'})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        if (!args[0]) {
            return sender.sendMessage('§cYou have te select a player.')
        }

        if (`${args[0]}`.toLowerCase() == sender.name.toLowerCase()) {
            return sender.sendMessage('§cYou can\'t send message to yourself.')
        } 

        if (!args[1]) {
            return sender.sendMessage('§cInvalid message.')
        } 

        let targetPlayer = sender.getServer().getPlayerByName(args[0])
        if (!targetPlayer) {
            return sender.sendMessage(`§cCan not find the player ${args[0]}.`)
        }

        let message = args.splice(1).join(' ')
        sender.sendMessage(`§7§oMe -> ${targetPlayer.name}: ${message}`)
        targetPlayer.sendMessage(`§7§o${sender.name} -> Me: ${message}`)
    }
}

module.exports = TellCommand