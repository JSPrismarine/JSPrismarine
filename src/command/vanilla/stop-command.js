const Command = require('../Command').default;
const Player = require('../../player/Player').default;

class StopCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:stop',
            description: 'Stops a server.',
            permission: 'minecraft.command.stop'
        });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    async execute(sender, args) {
        // TODO: implement operators and just check if player is operator

        if (args[0] && args[0].toLowerCase() == 'f') process.exit();

        sender.getServer().getServer().kill();
        return 'Stopping the server...';
    }
}
module.exports = StopCommand;
