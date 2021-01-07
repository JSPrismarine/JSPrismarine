/* eslint-disable promise/prefer-await-to-then */
import {
    CommandDispatcher,
    argument,
    literal,
    greedyString
} from '@jsprismarine/brigadier';
import Command from '../Command';
import { CommandArgumentEntity } from '../CommandArguments';
import Player from '../../player/Player';

export default class KickCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:kick',
            description: 'Kicks a player off the server.',
            permission: 'minecraft.command.kick'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('op').then(
                argument('player', new CommandArgumentEntity())
                    .then(
                        argument('reason', greedyString()).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const reason = context.getArgument(
                                    'reason'
                                ) as string;
                                const target = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('player')
                                    );

                                await target.kick(
                                    `You have been kicked from the server due to: \n\n${reason}!`
                                );
                                return `Kicked ${target.getFormattedUsername()} due to: ${reason}!`;
                            }
                        )
                    )
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        const target = source
                            .getServer()
                            .getPlayerByName(context.getArgument('player'));

                        await target.kick(
                            'You have been kicked from the server'
                        );
                        return `Kicked ${target.getFormattedUsername()}`;
                    })
            )
        );
    }
}
