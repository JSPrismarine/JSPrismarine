/*
Made by Kıraç Armağan Önal
07/09/2020
*/

const Command = require("../command")
const Player  = require("../../player")
const ConsoleSender = require("../console-sender");

"use strict";

class KickCommand extends Command {

    constructor() {
        // TODO: Add permissions
        super({name: "kick", description: "Kick a player from server."})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        if (!args[0]) return sender.sendMessage("§cYou have te select a player.")

        if (!args[1]) return sender.sendMessage("§cInvalid reason.")

        let targetPlayer = sender.getServer().getPlayerByName(args[0])

        if (!targetPlayer) return sender.sendMessage(`§cCan not find the player ${args[0]}.`)

        let reason = args.splice(1).join(" ")

        targetPlayer.kick(`You been kicked from server due to:\n\n${reason}`)
    }
}

module.exports = KickCommand