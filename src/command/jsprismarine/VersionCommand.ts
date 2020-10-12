/*
This command is non-vanilla, but exists in PMMP, Altay, MiNET, Nukkit a.s.o.
*/

import Player from "../../player/player";
import Command from "../Command";

const packageFile = require('../../../package.json');
const identifiers = require('../../network/identifiers');

export default class VersionCommand extends Command {

    constructor() {
        super({ namespace: 'jsprismarine', name: 'version', description: 'Displays general server informations.', aliases: ['about'] });
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args 
     */
    execute(sender: Player, args: Array<any>) {
        let serverVersion = packageFile.version;               //The only version reference I found, please contribute if there is a "better" one
        let protocolVersion = identifiers.Protocol;
        let minecraftVersion = identifiers.MinecraftVersion;

        sender.sendMessage(`This server is running on JSPrismarine ${serverVersion} for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`);
    }
}
