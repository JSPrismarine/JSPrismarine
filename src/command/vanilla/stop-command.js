/*
Made by Kıraç Armağan Önal
07/09/2020
*/

const Command = require("../command")
const Player  = require("../../player")
const ConsoleSender = require("../console-sender")


"use strict";

class StopCommand extends Command {

    constructor() {
        super({name: "stop", description: "Closes the server."})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        if (sender instanceof Player) return sender.sendMessage("§cThis command only executable by console.")
        sender.sendMessage("§cClosing the server..")
        sender.getServer().players.forEach((player)=>{player.kick("Server is closing..")})
        setTimeout(()=>{process.exit()},250);

    }
}

module.exports = StopCommand