const Command = require('../command')
const Player = require('../../player')
const logger = require('../../utils/logger')
const ConsoleSender = require('../console-sender')
const Gamemode = require('../../world/gamemode')

'use strict'

class GamemodeCommand extends Command {

    constructor() {
        super({name: 'gamemode', description: 'Sets a player\'s game mode.'})
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args
     */
    execute(sender, args) {
        if (args.length < 1 || args.length > 2) {
            logger.warn('Invalid format, please use /gamemode <identifier>')
        }

        let mode 
        switch (args[0]) {
            case 0:
            case 's':
            case 'survival':
                mode = Gamemode.Survival
                break
            case 1:
            case 'c':
            case 'creative':
                mode = Gamemode.Creative
                break
            default:
                sender.sendMessage('§eGamemode not found!')
                return 
        }

        let target = sender
        if (args.length > 1 && typeof args[1] === 'string') {
            if ((target = sender.getServer().getPlayerByName(args[1])) === null) {
                sender.sendMessage('§eTarget player is not online!')
                return
            } 
            target.setGamemode(mode)
            target.sendMessage('§eYour game mode has been updated to ' + Gamemode.getGamemodeName(mode))
        } else if (args.length > 1 && typeof args[1] === 'number') {
            if (sender instanceof Player) {
                sender.sendMessage('§eTarget player is not online!')
            } else {
                logger.warn('Target player is not online!')
            }
            return
        } else {
            if (!(sender instanceof Player)) {
                return logger.warn('You can run this command just in-game!')
            } 
            target.setGamemode(mode)
            target.sendMessage('§eYour game mode has been updated to ' + Gamemode.getGamemodeName(mode))
        }
    }
}
module.exports = GamemodeCommand