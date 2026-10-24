import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { string } from '@jsprismarine/brigadier';

import Player from '../../Player';
import { Command, argument, literal } from '../Command';
import { getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class GameRuleCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:gamerule',
            description: 'Set gamerule value.',
            permission: 'minecraft.command.gamerule'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('gameRule')
                .then(
                    argument('name', string()).then(
                        argument('value', string()).executes(async (context) => {
                            const source = context.getSource();
                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            const name = getString(context, 'name');
                            const value = getString(context, 'value').toLowerCase() === 'true';

                            source.getWorld().getGameRuleManager().setGameRule(name, value, true);

                            const res = `Set ${name} to ${value}`;
                            await source.sendMessage(res);
                            return res;
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource();
                    if (!(source instanceof Player)) throw new Error(`This command can't be run from the console`);

                    const gameRules = Array.from(source.getWorld().getGameRuleManager().getGameRules());
                    await source.sendMessage(gameRules.map(([id, [value]]) => `§a${id}§r: §b${value}§r`).join(', '));
                })
        );
    }
}
