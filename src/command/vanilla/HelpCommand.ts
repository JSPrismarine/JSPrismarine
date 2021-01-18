import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import CommandExecuter from '../CommandExecuter';

export default class HelpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:help',
            description: 'Get helpful information about commands.',
            permission: 'minecraft.command.help',
            aliases: ['?']
        } as any);
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        const execute = async (context: any) => {
            const source = context.getSource() as CommandExecuter;

            source
                .getServer()
                .getCommandManager()
                .getCommands()
                .forEach(async (command) => {
                    await source.sendMessage(
                        `§e/${command.id.split(':')[1]}:§r §7${
                            command.description
                        }`
                    );
                });
        };

        dispatcher.register(literal('help').executes(execute as any));
    }
}
