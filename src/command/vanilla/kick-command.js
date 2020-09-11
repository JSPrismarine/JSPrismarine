const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

'use strict'

class KickCommand extends Command {

    constructor() {
        // TODO: Add permissions
        super({name: 'kick', description: 'Kicks a player off the server.'})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        if (args.length < 1) {
            logger.warn('§cYou have to specify a player.')
        }

        let reason = args[1] ? args.slice(1).join(" ") : "No reason specified."
        let targetPlayer = sender.getServer().getPlayerByName(args[0])

        if (!targetPlayer) {
            return sender.sendMessage(`§cCan't find the player ${args[0]}.`)
        }

        targetPlayer.kick(`You been kicked from server due to:\n\n${reason}`)
    }
}

module.exports = KickCommand