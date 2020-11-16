import Player from '../../player/Player';
import Command from '../Command';
import Identifiers from '../../network/Identifiers';

const packageFile = require('../../../package.json');

export default class VersionCommand extends Command {
    constructor() {
        super({
            id: 'jsprismarine:version',
            description: 'Displays general server informations.',
            aliases: ['about']
        });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    public execute(sender: Player, args: Array<any>): void {
        let serverVersion = packageFile.version;
        let protocolVersion = Identifiers.Protocol;
        let minecraftVersion = Identifiers.MinecraftVersion;

        sender.sendMessage(
            `This server is running on JSPrismarine ${serverVersion} (rev-${
                sender.getServer().getQueryManager().git_rev
            }) for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`
        );
    }
}
