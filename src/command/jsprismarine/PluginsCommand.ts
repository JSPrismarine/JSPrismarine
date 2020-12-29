import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';

import Command from '../Command';
import Player from '../../player/Player';
import PluginFile from '../../plugin/PluginFile';

export default class PluginsCommand extends Command {
    constructor() {
        super({
            id: 'jsprismarine:plugins',
            description: 'Lists all plugins that run on the server.',
            aliases: ['pl']
        });

        this.parameters = [new Set()];

        this.parameters[0].add(
            new CommandParameter({
                name: 'plugin',
                type: CommandParameterType.String,
                optional: true
            })
        );
    }

    public async execute(
        sender: Player,
        args: Array<string | number>
    ): Promise<void> {
        const plugins = sender.getServer().getPluginManager().getPlugins();
        let message = '';

        if (plugins.length === 0) {
            await sender.sendMessage("§cCan't find any plugins.");
            return;
        }

        if (args[0]) {
            plugins.filter((plugin) =>
                plugin.getDisplayName().includes(args[0])
            );
            if (plugins.length === 0) {
                await sender.sendMessage(
                    `§cCan't find any plugins for '${args[0]}'.`
                );
                return;
            }

            message += `$7 Plugins found for '${args[0]}' (${plugins.length}): `;
        } else {
            message += `§7Plugins (${plugins.length}): `;
        }

        message += `§r ${plugins
            .map((p: PluginFile) => `§a${p.getDisplayName()} ${p.getVersion()}`)
            .join('§r, ')}`;

        await sender.sendMessage(message);
    }
}
