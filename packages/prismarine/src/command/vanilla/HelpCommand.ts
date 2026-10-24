import type { CommandContext, CommandDispatcher } from '@jsprismarine/brigadier';

import Player from '../../Player';
import { Command, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

export default class HelpCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:help',
            description: 'Get helpful information about commands.',
            permission: 'minecraft.command.help',
            aliases: ['?']
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        const execute = async (context: CommandContext<CommandExecutor>) => {
            const source = context.getSource();
            const permissionManager = source.getServer().getPermissionManager();

            source
                .getServer()
                .getCommandManager()
                .getCommands()
                .forEach(async (command) => {
                    // Only players are permission-gated, matching `CommandManager.dispatchCommand`.
                    if (source instanceof Player && !permissionManager.can(source).execute(command.permission)) return;

                    const usage = command.usage(dispatcher);

                    // TODO: deal with commands sharing the same name but not namespace (`minecraft:help` + `some-plugin:help`).
                    await source.sendMessage(
                        `§e/${command.name}§r${(usage && ` §b${usage}§r`) || ''}: §7${command.description}`
                    );
                });
        };

        dispatcher.register(literal('help').executes(execute));
    }
}
