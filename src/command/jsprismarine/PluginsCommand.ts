import Command from '../Command';
import PluginFile from '../../plugin/PluginFile';
import CommandExecuter from '../CommandExecuter';

export default class PluginsCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:plugins',
            description: 'Lists all plugins that run on the server.',
            permission: 'jsprismarine.command.plugins',
            aliases: ['pl']
        });
        this.api = 'rfc';
    }

    public async dispatch(sender: CommandExecuter): Promise<void> {
        const plugins = sender.getServer().getPluginManager().getPlugins();

        let message = '';
        message += `§7Plugins (${plugins.length}): `;
        message += `§r ${plugins
            .map((p: PluginFile) => `§a${p.getDisplayName()} ${p.getVersion()}`)
            .join('§r, ')}`;

        await sender.sendMessage(message);
    }
}
