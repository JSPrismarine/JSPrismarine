const Command = require('../command')
const Player  = require('../../player')
const ConsoleSender = require('../console-sender')

'use strict'

class PluginsCommand extends Command {

    constructor() {
        super({name: 'plugins', description: 'Plugin list', aliases:["pl"]})
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        let plugins = sender.getServer().getPluginManager().getPlugins();

        if (plugins.length == 0) {
            return sender.sendMessage("§cThere is no plugin loaded.")
        }
       
        let message = `§7Plugins (${plugins.length}):§r ${plugins.map(p=>`${p.manifest.name} ${p.manifest.version}`).join(", ")}`

        sender.sendMessage(message)

    }
}

module.exports = PluginsCommand