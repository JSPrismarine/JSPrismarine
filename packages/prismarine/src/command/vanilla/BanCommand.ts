import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { greedyString } from '@jsprismarine/brigadier';

import { Command, argument, literal } from '../Command';
import { PlayerArgumentCommand, getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

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

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('ban').then(
                argument('player', new PlayerArgumentCommand({ name: 'player' }))
                    .then(
                        argument('reason', greedyString()).executes(async (context) => {
                            const source = context.getSource();
                            const reason = getString(context, 'reason');
                            const target = getString(context, 'player');
                            const player = source
                                .getServer()
                                .getSessionManager()
                                .getAllPlayers()
                                .find((p) => p.getName() === target);

                            if (player) {
                                try {
                                    await player.kick(`You have been banned from the server due to: \n\n${reason}!`);
                                } catch (error: unknown) {
                                    source.getServer().getLogger().error(error);
                                }
                            }

                            await source.getServer().getBanManager().setBanned(target, reason);
                            return `Banned ${player ? player.getFormattedUsername() : target} due to: ${reason}!`;
                        })
                    )
                    .executes(async (context) => {
                        const source = context.getSource();
                        const target = getString(context, 'player');
                        const player = source
                            .getServer()
                            .getSessionManager()
                            .getAllPlayers()
                            .find((p) => p.getName() === target);

                        if (player) {
                            try {
                                await player.kick(`You have been banned!`);
                            } catch (error: unknown) {
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
