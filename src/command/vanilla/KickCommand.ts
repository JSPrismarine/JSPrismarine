/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';
import Command from '../Command';
import Player from '../../player/Player';
import { CommandArgumentEntity } from '../CommandArguments';

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
                argument('player', new CommandArgumentEntity()).executes(
                    async (context) => {
                        const source = context.getSource() as Player;
                        const target = source
                            .getServer()
                            .getPlayerByName(context.getArgument('player'));

                        await target.kick(
                            'You have been kicked from the server'
                        );
                        return `Kicked ${target.getFormattedUsername()}`;
                    }
                )
            )
        );
    }
}
