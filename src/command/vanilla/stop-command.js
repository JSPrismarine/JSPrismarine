const Command = require('../command')
const Player = require('../../player')
const ConsoleSender = require('../console-sender')

'use strict'

class StopCommand extends Command {

    constructor() {
        super({ namespace: 'minecraft', name: 'stop', description: 'Stops a server.' })
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    async execute(sender, args) {
        // TODO: implement operators and just check if player is operator

        sender.getServer().getLogger().warn('Server is closing...')
        await sender.getServer().getServer().kill()
    }
}
module.exports = StopCommand
