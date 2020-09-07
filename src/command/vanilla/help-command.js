/*
Made by Kıraç Armağan Önal
07/09/2020
*/

const Command = require("../command")
const Player  = require("../../player")
const ConsoleSender = require("../console-sender")


"use strict";

class HelpCommand extends Command {

    constructor() {
        super({name: "help", description: "Help!"})
    }

    // TODO: do better help command (paged)

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        let commandListMessage = Array.from(
            sender.getServer().getCommandManager().commands
        ).map((command)=>{
            return `§8-§7 /${command.name} §8-§f ${command.description}`
        }).join("\n")

        let resultMessage = `§2- - - - - §aCOMMANDS §2- - - - -\n${commandListMessage}\n§2${"- ".repeat(21).trim()}`

        sender.sendMessage(resultMessage)

    }
}

module.exports = HelpCommand