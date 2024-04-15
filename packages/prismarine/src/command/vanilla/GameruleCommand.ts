import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal, string } from '@jsprismarine/brigadier';

import type Player from '../../Player';
import { Command } from '../Command';

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
            literal('gamerule')
                .then(
                    argument('name', string()).then(
                        argument('value', string()).executes(async (context) => {
                            const source = context.getSource() as Player;
                            const name = context.getArgument('name');
                            let value = context.getArgument('value').toLowerCase() === 'true' ? true : false;

                            source.getWorld().getGameruleManager().setGamerule(name, value, true);

                            const res = `Set ${name} to ${value}`;
                            await source.sendMessage(res);
                            return res;
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource() as Player;
                    const gamerules = Array.from(source.getWorld().getGameruleManager().getGamerules());
                    await source.sendMessage(gamerules.map(([id, [value]]) => `§a${id}§r: §b${value}§r`).join(', '));
                })
        );
    }
}
