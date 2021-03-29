/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, greedyString, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';
import { PlayerArgumentCommand } from '../CommandArguments';

export default class BanCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:ban',
            description: 'Ban a player.',
            permission: 'minecraft.command.ban'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('ban').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' }))
                    .then(
                        argument('reason', greedyString()).executes(async (context) => {
                            const source = context.getSource() as Player;
                            const reason = context.getArgument('reason') as string;

                            try {
                                const target = source
                                    .getServer()
                                    .getPlayerManager()
                                    .getPlayerByName(context.getArgument('player'));
                                await target.kick(`You have been banned from the server due to: \n\n${reason}!`);
                            } catch {}

                            await source.getServer().getBanManager().setBanned(context.getArgument('player'), reason);

                            return `Banned ${context.getArgument('player')} due to: ${reason}!`;
                        })
                    )
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        try {
                            const target = source
                                .getServer()
                                .getPlayerManager()
                                .getPlayerByName(context.getArgument('player'));
                            await target.kick(`You have been banned!`);
                        } catch {}

                        await source.getServer().getBanManager().setBanned(context.getArgument('player'));

                        return `Banned ${context.getArgument('player')}`;
                    })
            )
        );
    }
}
