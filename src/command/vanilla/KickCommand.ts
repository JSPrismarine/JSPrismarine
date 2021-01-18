/* eslint-disable promise/prefer-await-to-then */
import {
    CommandDispatcher,
    argument,
    greedyString,
    literal
} from '@jsprismarine/brigadier';

import Command from '../Command';
import { CommandArgumentEntity } from '../CommandArguments';

export default class KickCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:kick',
            description: 'Kicks a player off the server.',
            permission: 'minecraft.command.kick'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('kick').then(
                argument('player', new CommandArgumentEntity())
                    .then(
                        argument('reason', greedyString()).executes(
                            async (context) => {
                                const reason = context.getArgument(
                                    'reason'
                                ) as string;
                                const target = context.getArgument('player');

                                await target.kick(
                                    `You have been kicked from the server due to: \n\n${reason}!`
                                );
                                return `Kicked ${target.getFormattedUsername()} due to: ${reason}!`;
                            }
                        )
                    )
                    .executes(async (context) => {
                        const target = context.getArgument('player');

                        await target.kick(
                            'You have been kicked from the server'
                        );
                        return `Kicked ${target.getFormattedUsername()}`;
                    })
            )
        );
    }
}
