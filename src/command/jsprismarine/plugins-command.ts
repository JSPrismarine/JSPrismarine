import Player from "../../player/player";

const Command = require('../command');

export default class PluginsCommand extends Command {

    constructor() {
        super({ namespace: 'jsprismarine', name: 'plugins', description: 'Lists all plugins that run on the server.', aliases: ["pl"] });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    execute(sender: Player, args: Array<any>) {

        let plugins = sender.getServer().getPluginManager().getPlugins();

        if (plugins.length == 0) {
            return sender.sendMessage("§cCan't find any plugins.");
        }

        let message = `§7Plugins (${plugins.length}):§r ${plugins.map(p => `${p.manifest.name} ${p.manifest.version}`).join(", ")}`;

        return sender.sendMessage(message);
    }
}
