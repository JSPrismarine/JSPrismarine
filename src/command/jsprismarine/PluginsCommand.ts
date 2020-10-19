import Player from "../../player";
import PluginFile from "../../plugin/PluginFile";

const Command = require('../').default;
// const Plugin = require('../../plugin/plugin');  // TODO: to interface

export default class PluginsCommand extends Command {
    constructor() {
        super({ id: 'jsprismarine:plugins', description: 'Lists all plugins that run on the server.', aliases: ["pl"] });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    public execute(sender: Player, args: Array<any>): void {
        let plugins = sender.getServer().getPluginManager().getPlugins();

        if (plugins.length == 0) {
            sender.sendMessage("§cCan't find any plugins.");
            return;
        }

        let message = `§7Plugins (${plugins.length}):§r ${plugins.map((p: PluginFile) => `${p.getDisplayName()} ${p.getVersion()}`).join(", ")}`;

        sender.sendMessage(message);
        return;
    }
}
