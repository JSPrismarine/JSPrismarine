const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

'use strict'

class StopCommand extends Command {

    constructor() {
        super({name: 'stop', description: 'Stops a server.'})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        // TODO: implement operators and just check if player is operator
        
        for (let player of sender.getServer().players.values()) {
            player.kick('Server closed.')
        }

        // TODO: promise.then(process.exit(1))
    }
}
module.exports = StopCommand