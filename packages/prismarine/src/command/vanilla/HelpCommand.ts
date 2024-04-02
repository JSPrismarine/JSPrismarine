import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import type { Player } from '../../';

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

                    const usage = command.usage(dispatcher);

                    // TODO: deal with commands sharing the same name but not namespace (`minecraft:help` + `some-plugin:help`).
                    await source.sendMessage(
                        `§e/${command.id.split(':').at(-1)}§r${(usage && ` §b${usage}§r`) || ''}: §7${command.description}`
                    );
                });
        };

        dispatcher.register(literal('help').executes(execute as any));
    }
}
