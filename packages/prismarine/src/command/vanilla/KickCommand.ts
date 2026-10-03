import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal } from '@jsprismarine/brigadier';

import { Command } from '../Command';
import { PlayerArgumentCommand } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

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
                argument('player', new PlayerArgumentCommand({ name: 'player' }))
                    .then(
                        argument('reason', greedyString()).executes(async (context) => {
                            const reason = context.getArgument('reason') as string;
                            return this.kick(
                                context.getSource() as CommandExecutor,
                                context.getArgument('player') as string,
                                `You have been kicked from the server due to: \n\n${reason}!`,
                                ` due to: ${reason}!`
                            );
                        })
                    )
                    .executes(async (context) =>
                        this.kick(
                            context.getSource() as CommandExecutor,
                            context.getArgument('player') as string,
                            'You have been kicked from the server!'
                        )
                    )
            )
        );
    }

    /**
     * Resolves the named player and kicks them.
     *
     * `PlayerArgumentCommand` parses a *name*, not a player: the `as Player[]` this used to
     * carry was untrue, and `targets.map` threw on every invocation - from the console as
     * much as from in game. Resolved the way `/ban` resolves it, through the source's
     * server, which is why that command worked and this one did not.
     */
    private async kick(source: CommandExecutor, name: string, message: string, suffix = ''): Promise<string> {
        const player = source
            .getServer()
            .getSessionManager()
            .getAllPlayers()
            .find((candidate) => candidate.getName() === name);

        if (!player) return `Cannot find player ${name}`;

        await player.kick(message);
        return `Kicked ${player.getFormattedUsername()}${suffix}`;
    }
}
