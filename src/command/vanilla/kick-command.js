const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

'use strict'

class KickCommand extends Command {

    constructor() {
        // TODO: Add permissions
        super({name: 'kick', description: 'Kick a player from server.'})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        if (args.length < 1 || args.length > 2) {
            logger.warn('Invalid format, please use /kick <identifier> <reason>')
        }

        let targetPlayer = sender.getServer().getPlayerByName(args[0])
        if (!targetPlayer) {
            return sender.sendMessage(`§cCan not find the player ${args[0]}.`)
        }

        targetPlayer.kick(`You been kicked from server due to:\n\n${args.splice(1).join(' ')}`)
    }
}

module.exports = KickCommand