import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';
import Player from '../../player/Player';
import PluginFile from '../../plugin/PluginFile';
import Command from '../Command';

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

    public execute(sender: Player, args: Array<string>): void {
        let plugins = sender.getServer().getPluginManager().getPlugins();
        let message: string = '';

        if (plugins.length == 0) {
            sender.sendMessage("§cCan't find any plugins.");
            return;
        }

        if (args[0]) {
            plugins.filter((plugin) =>
                plugin.getDisplayName().includes(args[0])
            );
            if (plugins.length == 0) {
                sender.sendMessage(
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

        sender.sendMessage(message);
        return;
    }
}
