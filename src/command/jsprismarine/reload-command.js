const Command = require('../command');
const Player = require('../../player/player').default;
const ConsoleSender = require('../console-sender');

class ReloadCommand extends Command {

    constructor() {
        super({ namespace: 'jsprismarine', name: 'reload', description: 'Reloads the server' });
    }

    /**
     * @param {ConsoleSender|Player} sender
     * @param {Array} args
     */
    execute(sender, args) {
        sender.sendMessage('§cPlease note that this command is not supported and may cause issues when using some plugins.');
        sender.sendMessage('§cIf you encounter any issues please use the /stop command to restart your server.');
        sender.getServer().reload();
        sender.sendMessage('§aReload complete.');
    }
}

module.exports = ReloadCommand;
