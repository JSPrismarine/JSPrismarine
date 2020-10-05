const Command = require('../command')
const Player = require('../../player')
const ConsoleSender = require('../console-sender')

class ListCommand extends Command {

    constructor() {
        super({ namespace: 'minecraft', name: 'list', description: 'Lists players on the server.' })
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args 
     */
    execute(sender, args) {
        let players = sender.getServer().getOnlinePlayers()
        let playerArray = Array.from(players)
        let maxPlayers = sender.getServer().getRaknet().name.getMaxPlayerCount()
        let counter = playerArray.length
        let answer = playerArray.map(player => player.name).join(', ')

        sender.sendMessage(`There are ${counter}/${maxPlayers} players online:`)
        if (answer)
            sender.sendMessage(answer)
    }
}

module.exports = ListCommand
