import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal } from '@jsprismarine/brigadier';
import { CommandArgumentCommand, CommandArgumentEntity } from '../CommandArguments';

import type Player from '../../Player';
import { Command } from '../Command';

export default class ExecuteCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:execute',
            description: 'Executes a command on a player target.',
            permission: 'minecraft.command.execute'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('execute')
                .then(
                    argument('player', new CommandArgumentEntity()).then(
                        argument('command', new CommandArgumentCommand())
                            .executes(async (context) => {
                                const source = context.getSource() as Player;
                                const targets = context.getArgument('player') as Player[];
                                const command = context.getArgument('command') as string;
                                await Promise.all(
                                    targets.map(async (target) =>
                                        source.getServer().getCommandManager()?.dispatchCommand(source, target, command)
                                    )
                                );
                            })
                            .then(
                                argument('arguments', greedyString()).executes(async (context) => {
                                    const source = context.getSource() as Player;
                                    const targets = context.getArgument('player') as Player[];
                                    const command = context.getArgument('command') as string;
                                    const args = context.getArgument('arguments') as string;

                                    await Promise.all(
                                        targets.map(async (target) =>
                                            source
                                                .getServer()
                                                .getCommandManager()
                                                ?.dispatchCommand(source, target, `${command} ${args}`)
                                        )
                                    );
                                })
                            )
                    )
                )
                .then(
                    argument('command', new CommandArgumentCommand())
                        .executes(async (context) => {
                            const source = context.getSource() as Player;
                            const command = context.getArgument('command') as string;
                            await source.getServer().getCommandManager()?.dispatchCommand(source, source, command);
                        })
                        .then(
                            argument('arguments', greedyString()).executes(async (context) => {
                                const source = context.getSource() as Player;
                                const command = context.getArgument('command') as string;
                                const args = context.getArgument('arguments') as string;
                                await source
                                    .getServer()
                                    .getCommandManager()
                                    ?.dispatchCommand(source, source, `${command} ${args}`);
                            })
                        )
                )
        );
    }
}
