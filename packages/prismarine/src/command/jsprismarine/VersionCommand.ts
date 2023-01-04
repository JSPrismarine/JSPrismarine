import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command.js';
import Identifiers from '../../network/Identifiers.js';
import Player from '../../player/Player.js';

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
                const serverVersion = source.getServer().getVersion();
                const protocolVersion = Identifiers.Protocol;
                const minecraftVersion = Identifiers.MinecraftVersion;

                await source.sendMessage(
                    `This server is running on JSPrismarine ${serverVersion} (rev-${
                        source.getServer().getQueryManager().git_rev
                    }) for Minecraft: Bedrock Edition v${minecraftVersion} (protocol version ${protocolVersion})`
                );
            })
        );
    }
}
