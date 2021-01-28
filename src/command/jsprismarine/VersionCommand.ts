import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Identifiers from '../../network/Identifiers';
import Player from '../../player/Player';
import packageFile from '../../../package.json';

export default class VersionCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:version',
            description: 'Displays general server information.',
            permission: 'jsprismarine.command.version',
            aliases: ['about']
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('version').executes(async (context) => {
                const source = context.getSource() as Player;
                const serverVersion = packageFile.version;
                const protocolVersion = Identifiers.Protocol;
                const minecraftVersion = Identifiers.MinecraftVersion;

                await source.sendMessage(
                    `This server is running on JSPrismarine ${serverVersion} (rev-${source.getServer().getQueryManager().git_rev
                    }) for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`
                );
            })
        );
    }
}
