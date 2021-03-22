/* eslint-disable promise/prefer-await-to-then */
import { CommandArgumentCommand, CommandArgumentEntity } from '../CommandArguments';
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import type Player from '../../player/Player';

export default class ExecuteCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:execute',
            description: 'Executes a command on a player target',
            permission: 'minecraft.command.execute'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('execute').then(
                argument('player', new CommandArgumentEntity()).then(
                    argument('command', new CommandArgumentCommand()).executes(async (context) => {
                        const source = context.getSource() as Player;
                        const target = context.getArgument('player')[0] as Player;
                        const command = context.getArgument('command') as string;
                        await source.getServer().getCommandManager().dispatchCommand(target, command);
                    })
                )
            )
        );
    }
}
