/* eslint-disable promise/prefer-await-to-then */
import {
    CommandContext,
    CommandDispatcher,
    argument,
    literal,
    string
} from '@jsprismarine/brigadier';
import Command from '../Command';
import { CommandArgumentGamemode } from '../CommandArguments';
import Gamemode from '../../world/Gamemode';
import Player from '../../player/Player';
export default class GamemodeCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:gamemode',
            description: 'Changes gamemode for a player.',
            permission: 'minecraft.command.gamemode'
        });
    }

    private async setGamemode(
        source: Player,
        target: Player,
        gamemode: string
    ) {
        if (!target) {
            await source.sendMessage(`Player is not online!`);
            return;
        }

        if (!target.isPlayer()) {
            await source.sendMessage(
                `Can't set ${source.getFormattedUsername()} to ${gamemode}`
            );
            return;
        }

        await target.setGamemode(Gamemode.getGamemodeId(gamemode));
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('gamemode').then(
                argument('gamemode', new CommandArgumentGamemode())
                    .then(
                        argument('player', string()).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const target = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('player')
                                    );

                                const gamemode = context.getArgument(
                                    'gamemode'
                                ) as string;

                                await this.setGamemode(
                                    source,
                                    target!,
                                    gamemode
                                );
                            }
                        )
                    )
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        const gamemode = context.getArgument(
                            'gamemode'
                        ) as string;

                        await this.setGamemode(source, source, gamemode);
                    })
            )
        );
    }
}
