/*
Made with love by itsDkiller
GH:      https://github.com/itsDkiller
Discord: itsDkiller#4689
*/

const Command = require('../command')
const Player  = require('../../player')
const Logger = require('../../utils/logger')
const ConsoleSender = require('../console-sender')

'use strict';

class TellCommand extends Command {

    constructor() {
        super({name: 'tell', description: 'Tell a message to a player.', aliases: ['msg']})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        let target
        let message

        if (sender instanceof Player) {

            if (!args[0]) {
                return sender.sendMessage('§cYou have to choose a player.')
            } else if (!args[1]) {
                return sender.sendMessage('§cCannot send an empty message.')
            }

            target = sender.getServer().getPlayerByName(args[0])
            message = args.slice(1).join(" ")

            if (!target) return sender.sendMessage(`§cCannot find player ${args[0]}.`)
            if (target.name === sender.name) return sender.sendMessage('§cYou cannot send a message to yourself.')

            target.sendMessage(`§e[${sender.name} -> ${target.name}]§r ${message}`)
            sender.sendMessage(`§e[${sender.name} -> ${target.name}]§r ${message}`)

        } else {

            if (!args[0]) {
                return Logger.warn('You have to choose a player.')
            } else if (!args[1]) {
                return Logger.warn('Cannot send an empty message.')
            }

            target = sender.getServer().getPlayerByName(args[0])
            message = args.slice(1).join(" ")

            if (!target) return Logger.warn('Cannot find player ' + args[0] + '.')

            target.sendMessage(`§e[CONSOLE -> ${target.name}]§r ${message}`)
            Logger.info(`[CONSOLE -> ${target.name}] ${message}`)

        }
    }
}

module.exports = TellCommand