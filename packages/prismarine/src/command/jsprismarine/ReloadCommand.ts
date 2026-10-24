import type { CommandContext, CommandDispatcher } from '@jsprismarine/brigadier';

import { Command, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

export default class ReloadCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:reload',
            description: 'Reloads the server.',
            permission: 'jsprismarine.command.reload'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        const execute = async (context: CommandContext<CommandExecutor>) => {
            const source = context.getSource();

            await source.sendMessage(
                '§cPlease note that this command is not supported and may cause issues when using plugins or other modifications.'
            );
            await source.sendMessage(
                '§cIf you encounter any issues please use the /stop command to restart your server.'
            );
            await source.getServer().reload();
            await source.sendMessage('§aReload complete.');

            return 'Reloaded the server';
        };

        dispatcher.register(literal('reload').executes(execute));
    }
}
