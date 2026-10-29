import type { CommandDispatcher } from '@jsprismarine/brigadier';

import { describeSupportedProtocols } from '../../network/codec/describeCodecs';
import { Command, asyncCommand, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

export default class VersionCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:version',
            description: 'Displays general server information.',
            permission: 'jsprismarine.command.version',
            aliases: ['about']
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('version').executes(
                asyncCommand(async (context) => {
                    const source = context.getSource();
                    const serverVersion = source.getServer().getVersion();
                    await source.sendMessage(
                        `This server is running on JSPrismarine §e${serverVersion}§r for Minecraft: Bedrock Edition, speaking ${describeSupportedProtocols().join('; ')}`
                    );
                })
            )
        );
    }
}
