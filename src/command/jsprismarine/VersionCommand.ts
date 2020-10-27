/*
This command is non-vanilla, but exists in PMMP, Altay, MiNET, Nukkit a.s.o.
*/

import type Player from "../../player/Player";
import Command from "../";
import git from 'git-rev-sync';
import Identifiers from "../../network/Identifiers";

const packageFile = require('../../../package.json');
<<<<<<< HEAD
const identifiers = require('../../network/Identifiers');
=======
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e

export default class VersionCommand extends Command {
    constructor() {
        super({ id: 'jsprismarine:version', description: 'Displays general server informations.', aliases: ['about'] });
    }

    /**
     * @param {Player} sender 
     * @param {Array} args 
     */
    public execute(sender: Player, args: Array<any>): void {
        let serverVersion = packageFile.version;
        let protocolVersion = Identifiers.Protocol;
        let minecraftVersion = Identifiers.MinecraftVersion;

        sender.sendMessage(`This server is running on JSPrismarine ${serverVersion} (rev-${git.short() || 'unknown'}) for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`);
    }
}
