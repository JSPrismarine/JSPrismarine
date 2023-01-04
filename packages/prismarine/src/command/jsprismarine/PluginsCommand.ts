import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command.js';
import Player from '../../player/Player.js';
import PluginFile from '../../plugin/PluginFile.js';

export default class PluginsCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:plugins',
            description: 'Lists all plugins that run on the server.',
            permission: 'jsprismarine.command.plugins',
            aliases: ['pl']
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('plugins').executes(async (context) => {
                const source = context.getSource() as Player;
                const plugins = source.getServer().getPluginManager().getPlugins();

                let message = '';
                message += `§7Plugins (${plugins.length}): `;
                message += `§r ${plugins
                    .map((p: PluginFile) => `§a${p.getDisplayName()} ${p.getVersion()}`)
                    .join('§r, ')}`;

                await source.sendMessage(message);
            })
        );
    }
}
