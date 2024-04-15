import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal } from '@jsprismarine/brigadier';

import type Player from '../../Player';
import { Command } from '../Command';
import { PlayerArgumentCommand } from '../CommandArguments';

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
                            const targets = context.getArgument('player') as Player[];
                            const reason = context.getArgument('reason') as string;

                            await Promise.all(
                                targets.map(
                                    async (target) =>
                                        await target.kick(`You have been kicked from the server due to: \n\n${reason}!`)
                                )
                            );
                            return `Kicked ${targets
                                .map((target) => target.getFormattedUsername())
                                .join(', ')} due to: ${reason}!`;
                        })
                    )
                    .executes(async (context) => {
                        const targets = context.getArgument('player') as Player[];

                        await Promise.all(
                            targets.map(async (target) => await target.kick(`You have been kicked from the server!`))
                        );
                        return `Kicked ${targets.map((target) => target.getFormattedUsername()).join(', ')}`;
                    })
            )
        );
    }
}
