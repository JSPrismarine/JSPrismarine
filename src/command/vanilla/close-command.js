/*
Made by Kıraç Armağan Önal
*/

const Command = require("../command")
const Player  = require("../../player")
const ConsoleSender = require("../console-sender")
const logger = require("../../utils/logger")


"use strict";

class CloseCommand extends Command {

    constructor() {
        super({name: "close", description: "Closes the server."})
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {string} message 
     */
    _sendMessage(sender, message) {
        if (sender instanceof Player) {
            sender.sendMessage(`§c${message}`);
        } else {
            logger.warn(message);
        }
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        if (sender instanceof Player) return this._sendMessage(sender, "This command only executable by console.")
        this._sendMessage(sender, "Closing the server..")
        //sender.getServer().players.forEach(p=>p.removeFromPlayerList()) // I am not sure about that please look that @HerryYT 
        process.exit();

    }
}

module.exports = CloseCommand