import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command.js';
import Player from '../../Player.js';

export default class StopCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:stop',
            description: 'Stops a server.',
            permission: 'minecraft.command.stop'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('stop').executes(async (context) => {
                const source = context.getSource() as Player;

                await source.getServer().getServer().shutdown();
                return 'Stopping the server...';
            })
        );
    }
}
