import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal, string } from '@jsprismarine/brigadier';

import type Player from '../../Player';
import { Command } from '../Command';

export default class GameRuleCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:gamerule',
            description: 'Set gamerule value.',
            permission: 'minecraft.command.gamerule'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('gameRule')
                .then(
                    argument('name', string()).then(
                        argument('value', string()).executes(async (context) => {
                            const source = context.getSource() as Player;
                            const name = context.getArgument('name');
                            let value = context.getArgument('value').toLowerCase() === 'true' ? true : false;

                            source.getWorld().getGameRuleManager().setGameRule(name, value, true);

                            const res = `Set ${name} to ${value}`;
                            await source.sendMessage(res);
                            return res;
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource() as Player;
                    const gameRules = Array.from(source.getWorld().getGameRuleManager().getGameRules());
                    await source.sendMessage(gameRules.map(([id, [value]]) => `§a${id}§r: §b${value}§r`).join(', '));
                })
        );
    }
}
