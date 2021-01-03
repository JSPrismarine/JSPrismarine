import Command from '../Command';
import Identifiers from '../../network/Identifiers';
import Player from '../../player/Player';

const packageFile = require('../../../package.json');

export default class VersionCommand extends Command {
    constructor() {
        super({
            id: 'jsprismarine:version',
            description: 'Displays general server information.',
            aliases: ['about']
        });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    public async execute(sender: Player, args: any[]): Promise<void> {
        const serverVersion = packageFile.version;
        const protocolVersion = Identifiers.Protocol;
        const minecraftVersion = Identifiers.MinecraftVersion;

        await sender.sendMessage(
            `This server is running on JSPrismarine ${serverVersion} (rev-${
                sender.getServer().getQueryManager().git_rev
            }) for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`
        );
    }
}
