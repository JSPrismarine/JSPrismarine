const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

class ListCommand extends Command {

    constructor() {
        super({ name: 'list', description: 'Lists players on the server.'})
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args 
     */
    execute(sender, args) {
        let players      = sender.getServer().players.values()
        let player_array = Array.from(players)
        let counter      = player_array.length
        let answer       = player_array.map(player => player.name + ',').join(' ')

        sender.sendMessage(`There are ${counter} players online:`) //TODO: Add max player amount ("There are 2/x players online")
        sender.sendMessage(answer)
    }
}

module.exports = ListCommand