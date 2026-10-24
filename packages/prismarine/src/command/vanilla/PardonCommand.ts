import type { CommandDispatcher } from '@jsprismarine/brigadier';

import { Command, argument, literal } from '../Command';
import { PlayerArgumentCommand, getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class PardonCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:pardon',
            description: 'Pardon a player.',
            permission: 'minecraft.command.pardon'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('pardon').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' })).executes(async (context) => {
                    const source = context.getSource();
                    const username = getString(context, 'player');
                    await source.getServer().getBanManager().setUnbanned(username);

                    return `Unbanned ${username}`;
                })
            )
        );
    }
}
