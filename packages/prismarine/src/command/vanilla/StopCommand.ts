import type { CommandDispatcher } from '@jsprismarine/brigadier';

import { Command, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

export default class StopCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:stop',
            description: 'Stops a server.',
            permission: 'minecraft.command.stop'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('stop').executes(async (context) => {
                const source = context.getSource();

                await source.getServer().getServer().shutdown();
                return 'Stopping the server...';
            })
        );
    }
}
