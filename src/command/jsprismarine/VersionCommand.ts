/*
This command is non-vanilla, but exists in PMMP, Altay, MiNET, Nukkit a.s.o.
*/

import type Player from "../../player/Player";
import Command from "../";
import git from 'git-rev-sync';

const packageFile = require('../../../package.json');
const identifiers = require('../../network/Identifiers');

export default class VersionCommand extends Command {
    constructor() {
        super({ id: 'jsprismarine:version', description: 'Displays general server informations.', aliases: ['about'] });
    }

    /**
     * @param {ConsoleSender|Player} sender 
     * @param {Array} args 
     */
    public execute(sender: Player, args: Array<any>): void {
        let serverVersion = packageFile.version;
        let protocolVersion = identifiers.Protocol;
        let minecraftVersion = identifiers.MinecraftVersion;

        sender.sendMessage(`This server is running on JSPrismarine ${serverVersion} (rev-${git.short() || 'unknown'}) for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`);
    }
}
