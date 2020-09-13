/*
This command is non-vanilla, but exists in PMMP, Altay, MiNET, Nukkit a.s.o.
*/

const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

class VersionCommand extends Command {

    constructor() {
        super({ name: 'version', description: 'Displays general server informations.', aliases: ['about']})
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args 
     */
    execute(sender, args) {
        let server_version    = require('../../../package.json').version               //The only version reference I found, please contribute if there is a "better" one
        let protocol_version  = require('../../network/identifiers').Protocol
        let minecraft_version = require('../../network/identifiers').MinecraftVersion

        sender.sendMessage(`This server is running on JSPrismarine ${server_version} for Minecraft: Bedrock Edition v${minecraft_version} (protocol version ${protocol_version})`)
    }
}

module.exports = VersionCommand