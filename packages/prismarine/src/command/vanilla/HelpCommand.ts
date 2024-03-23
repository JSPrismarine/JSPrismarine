import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import { Player } from '../../';

export default class HelpCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:help',
            description: 'Get helpful information about commands.',
            permission: 'minecraft.command.help',
            aliases: ['?']
        } as any);
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        const execute = async (context: any) => {
            const source = context.getSource() as Player;

            source
                .getServer()
                .getCommandManager()
                .getCommands()
                .forEach(async (command) => {
                    if (!source.getServer().getPermissionManager().can(source).execute(command.permission)) return;

                    // TODO: handle multiple commands with the same id but different namespaces
                    await source.sendMessage(`§e/${command.id.split(':')[1]}:§r §7${command.description}`);
                });
        };

        dispatcher.register(literal('help').executes(execute as any));
    }
}
