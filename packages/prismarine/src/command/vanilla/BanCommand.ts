import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal } from '@jsprismarine/brigadier';

import type Player from '../../Player';
import { Command } from '../Command';
import { PlayerArgumentCommand } from '../CommandArguments';

/**
 * Ban a player.
 * @remarks the `/ban` command.
 */
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
                            const target = context.getArgument('player');
                            const player = source
                                .getServer()
                                .getSessionManager()
                                .getAllPlayers()
                                .find((p) => p.getName() === target);

                            if (player) {
                                try {
                                    await player.kick(`You have been banned from the server due to: \n\n${reason}!`);
                                } catch (error: any) {
                                    source.getServer().getLogger().error(error);
                                }
                            }

                            await source.getServer().getBanManager().setBanned(target, reason);
                            return `Banned ${player ? player.getFormattedUsername() : target} due to: ${reason}!`;
                        })
                    )
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        const target = context.getArgument('player');
                        const player = source
                            .getServer()
                            .getSessionManager()
                            .getAllPlayers()
                            .find((p) => p.getName() === target);

                        if (player) {
                            try {
                                await player.kick(`You have been banned!`);
                            } catch (error: any) {
                                source.getServer().getLogger().error(error);
                            }
                        }

                        await source.getServer().getBanManager().setBanned(target);
                        return `Banned ${player ? player.getFormattedUsername() : target}`;
                    })
            )
        );
    }
}
