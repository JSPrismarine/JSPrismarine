/*
This command is non-vanilla, but exists in PMMP, Altay, MiNET, Nukkit a.s.o.
*/

const Command       = require('../command')
const Player        = require('../../player')
const ConsoleSender = require('../console-sender')
const package       = require('../../../package.json')
const identifiers   = require('../../network/identifiers')

class VersionCommand extends Command {

    constructor() {
        super({ name: 'version', description: 'Displays general server informations.', aliases: ['about']})
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args 
     */
    execute(sender, args) {
        let serverVersion    = package.version               //The only version reference I found, please contribute if there is a "better" one
        let protocolVersion  = identifiers.Protocol
        let minecraftVersion = identifiers.MinecraftVersion

        sender.sendMessage(`This server is running on JSPrismarine ${serverVersion} for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`)
    }
}

module.exports = VersionCommand