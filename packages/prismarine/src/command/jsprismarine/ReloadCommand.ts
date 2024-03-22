import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import type Player from '../../Player';

export default class ReloadCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:reload',
            description: 'Reloads the server.',
            permission: 'jsprismarine.command.reload'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        const execute = async (context: any) => {
            const source: Player = (context?.getSource() as Player) || null;

            if (!source) throw new Error('Context/source is null or undefined');

            await source.sendMessage(
                '§cPlease note that this command is not supported and may cause issues when using some plugins.'
            );
            await source.sendMessage(
                '§cIf you encounter any issues please use the /stop command to restart your server.'
            );
            await source.getServer().reload();
            await source.sendMessage('§aReload complete.');

            return 'Reloaded the server';
        };

        dispatcher.register(literal('reload').executes(execute as any));
    }
}
