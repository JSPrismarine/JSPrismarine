/*
Made by Kıraç Armağan Önal
07/09/2020
*/

const Command = require("../command")
const Player  = require("../../player")
const ConsoleSender = require("../console-sender")
const Logger = require("../../utils/logger")
const SetTitlePacket = require("../../network/packet/set-title-packet")
const SetTitleType = require("../../network/type/set-title-type")


"use strict";

class TitleCommand extends Command {

    constructor() {
        // TODO: add permissions to command
        super({name: "title", description: "Controls screen titles."})
    }

    // TODO: add clear and times
    titleTypes = {
        "title": SetTitleType.SetTitle,
        "subtitle": SetTitleType.SetSubtitle,
        "actionbar": SetTitleType.SetActionBarMessage
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

        /** @type {Array<Player>} */
        let targets = [];

        if (!args[0]) return this._sendMessage(sender, "You have te select a player or type @a.")

        if (!Object.keys(this.titleTypes).includes(`${args[1]}`.toLowerCase())) return this._sendMessage(sender, `Invalid title type. Valid types: ${Object.keys(this.titleTypes).join(", ")}.`)

        if (!args[2]) return this._sendMessage(sender, "Invalid message.")

        let message = args.slice(2).join(" ");

        if (args[0] == "@a") {
            let players = Array.from(sender.getServer().players.values());
            if (players.length == 0) return this._sendMessage(sender, "There is no player to send title.")
            targets.push(...players)
        } else {
            let player = sender.getServer().getPlayerByName(args[0])
            if (!player) return this._sendMessage(sender, `Can not find player ${args[0]}.`)
            targets.push(player);
        }

        targets.forEach((player)=>{
            let pk = new SetTitlePacket()
            pk.type = this.titleTypes[args[1]]
            pk.text = message;
            player.sendDataPacket(pk)
        })

    }
}

module.exports = TitleCommand