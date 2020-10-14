const Command = require('../').default;
const Player = require('../../player').default;
const CommandParameter = require('../../network/type/CommandParameter').default;

class KickCommand extends Command {
    constructor() {
        // TODO: Add permissions
        super({ namespace: 'minecraft', name: 'kick', description: 'Kicks a player off the server.' });

        this.parameters = [
            new Set()
        ];
        this.parameters[0].add(new CommandParameter({
            name: 'target',
            type: 0x100000 | 0x06,
            optional: false
        }));
        this.parameters[0].add(new CommandParameter({
            name: 'message',
            type: 0x100000 | 0x1d,
            optional: true
        }));
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    execute(sender, args) {

        if (!args[0]) {
            return sender.sendMessage("§cYou have to specify a player.");
        }

        let reason = args[1] ? args.slice(1).join(" ") : "No reason specified.";
        let target = sender.getServer().getPlayerByName(args[0]);

        if (!target) {
            return sender.sendMessage("§cCan't find the selected player.");
        }

        return target.kick("You have been kicked from the server due to: \n\n" + reason);
    }
}

module.exports = KickCommand;
