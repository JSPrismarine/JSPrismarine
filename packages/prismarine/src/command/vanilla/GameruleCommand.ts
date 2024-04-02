import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal, string } from '@jsprismarine/brigadier';

import { Command } from '../Command';
import type Player from '../../Player';

export default class GameruleCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:gamerule',
            description: 'Set gamerule value.',
            permission: 'minecraft.command.gamerule'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('gamerule').then(
                argument('name', string()).then(
                    argument('value', string()).executes(async (context) => {
                        const source = context.getSource() as Player;
                        const name = context.getArgument('name');
                        let value = context.getArgument('value').toLowerCase();

                        if (value === 'true') value = true;
                        if (value === 'false') value = false;

                        source.getWorld().getGameruleManager().setGamerule(name, value, true);
                        // TODO: notify clients about gamerule change

                        const res = `Set ${name} to ${value}`;
                        await source.sendMessage(res);
                        return res;
                    })
                )
            )
        );
    }
}
