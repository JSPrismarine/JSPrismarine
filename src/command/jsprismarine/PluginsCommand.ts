import type Player from "../../player/Player";
import type PluginFile from "../../plugin/PluginFile";

const Command = require('../Command').default;

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

        let message = `§7Plugins (${plugins.length}):§r ${plugins.map((p: PluginFile) => `§a${p.getDisplayName()} ${p.getVersion()}`).join("§r, ")}`;

        sender.sendMessage(message);
        return;
    }
}
