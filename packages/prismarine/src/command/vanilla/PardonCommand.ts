/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';
import { PlayerArgumentCommand } from '../CommandArguments';

export default class PardonCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:pardon',
            description: 'Pardon a player.',
            permission: 'minecraft.command.pardon'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('pardon').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' })).executes(async (context) => {
                    const source = context.getSource() as Player;
                    await source.getServer().getBanManager().setUnbanned(context.getArgument('player'));

                    return `Unbanned ${context.getArgument('player')}`;
                })
            )
        );
    }
}
