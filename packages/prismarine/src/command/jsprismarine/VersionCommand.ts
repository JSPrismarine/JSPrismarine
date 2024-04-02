import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Identifiers from '../../network/Identifiers';
import type Player from '../../Player';

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
                const advertisedVersion =
                    Identifiers.MinecraftVersions.length <= 1
                        ? `§ev${Identifiers.MinecraftVersions.at(0)}§r`
                        : `§ev${Identifiers.MinecraftVersions.at(0)}§r-§ev${Identifiers.MinecraftVersions.at(-1)}§r`;

                await source.sendMessage(
                    `This server is running on JSPrismarine §e${serverVersion}§r for Minecraft: Bedrock Edition ${advertisedVersion} (protocol version §e${protocolVersion}§r)`
                );
            })
        );
    }
}
