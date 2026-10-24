import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { greedyString } from '@jsprismarine/brigadier';

import { Command, argument, literal } from '../Command';
import { CommandArgumentCommand, CommandArgumentEntity, getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

export default class ExecuteCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:execute',
            description: 'Executes a command on a player target.',
            permission: 'minecraft.command.execute'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('execute')
                .then(
                    argument('player', new CommandArgumentEntity()).then(
                        argument('command', new CommandArgumentCommand())
                            .executes(async (context) => {
                                const source = context.getSource();
                                const targets = CommandArgumentEntity.getEntities(context, 'player');
                                const command = getString(context, 'command');
                                await Promise.all(
                                    targets.map(async (target) =>
                                        source.getServer().getCommandManager().dispatchCommand(source, target, command)
                                    )
                                );
                            })
                            .then(
                                argument('arguments', greedyString()).executes(async (context) => {
                                    const source = context.getSource();
                                    const targets = CommandArgumentEntity.getEntities(context, 'player');
                                    const command = getString(context, 'command');
                                    const args = getString(context, 'arguments');

                                    await Promise.all(
                                        targets.map(async (target) =>
                                            source
                                                .getServer()
                                                .getCommandManager()
                                                .dispatchCommand(source, target, `${command} ${args}`)
                                        )
                                    );
                                })
                            )
                    )
                )
                .then(
                    argument('command', new CommandArgumentCommand())
                        .executes(async (context) => {
                            const source = context.getSource();
                            const command = getString(context, 'command');
                            await source.getServer().getCommandManager().dispatchCommand(source, source, command);
                        })
                        .then(
                            argument('arguments', greedyString()).executes(async (context) => {
                                const source = context.getSource();
                                const command = getString(context, 'command');
                                const args = getString(context, 'arguments');
                                await source
                                    .getServer()
                                    .getCommandManager()
                                    .dispatchCommand(source, source, `${command} ${args}`);
                            })
                        )
                )
        );
    }
}
