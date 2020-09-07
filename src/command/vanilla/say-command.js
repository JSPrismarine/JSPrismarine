/*
Made by Kıraç Armağan Önal
07/09/2020
*/

const Command = require("../command")
const Player  = require("../../player")
const ConsoleSender = require("../console-sender")
const Logger = require("../../utils/logger")


"use strict";

class SayCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({name: "say", description: "Say!"})
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {string} message 
     */
    _sendMessage(sender, message) {
        if (sender instanceof Player) {
            sender.sendMessage(`§c${message}`);
        } else {
            Logger.warn(message);
        }
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        let senderName = (sender instanceof ConsoleSender ? "CONSOLE" : sender.name)

        if (!args[0]) return this._sendMessage(sender, "Invalid message.")

        let message = args.join(" ")

        let messageToSend = `[${senderName}] ${message}`
        Logger.silly(messageToSend)
        sender.getServer().players.forEach((player)=>{
            player.sendMessage(senderName == "CONSOLE" ? `§d${messageToSend}` : messageToSend)
        })

    }
}

module.exports = SayCommand