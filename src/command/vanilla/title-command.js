const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')
const SetTitlePacket = require('../../network/packet/set-title-packet')
const SetTitleType = require('../../network/type/set-title-type')

'use strict'

const TitleTypes = {
    'title': SetTitleType.SetTitle,
    'subtitle': SetTitleType.SetSubtitle,
    'actionbar': SetTitleType.SetActionBarMessage,
    'clear': SetTitleType.ClearTitle
}
class TitleCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({name: 'title', description: 'Controls screen titles.'})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        if (!args[0]) {
            return sender.sendMessage('§cYou have to select a player or type @a.')
        }

        if (!Object.keys(TitleTypes).includes(`${args[1]}`.toLowerCase())) {
            return sender.sendMessage(`§cInvalid title type. Valid types: ${Object.keys(this.titleTypes).join(', ')}.`)
        } 

        if (!args[2] && args[1] != 'clear') {
            return sender.sendMessage('§cInvalid message.')
        } 

        /** @type {Array<Player>} */
        let targets = []

        if (args[0] == '@a') {
            let players = Array.from(sender.getServer().players.values())
            if (players.length == 0) {
                return sender.sendMessage('§cThere is no player to send title.')
            } 
            targets.push(...players)
        } else {
            let player = sender.getServer().getPlayerByName(args[0])
            if (!player) return sender.sendMessage(`§cCan not find the player ${args[0]}.`)
            targets.push(player)
        }

        let text = args.slice(2).join(' ')
        for (let i = 0; i < targets.length; i++) {
            let player = targets[i]
            let pk = new SetTitlePacket()
            pk.type = TitleTypes[args[1]]
            if (args[1] != "clear") {
                pk.text = text
            }
            player.sendDataPacket(pk)
        }
    }
}

module.exports = TitleCommand