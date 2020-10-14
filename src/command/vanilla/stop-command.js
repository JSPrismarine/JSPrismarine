const Command = require('../Command').default;
const Player = require('../../player').default;

class StopCommand extends Command {

    constructor() {
        super({ namespace: 'minecraft', name: 'stop', description: 'Stops a server.' });
    }

    /**
     * @param {Player} sender
     * @param {Array} args
     */
    async execute(sender, args) {
        // TODO: implement operators and just check if player is operator

        sender.getServer().getLogger().warn('Server is closing...');
        if (args[0] && args[0].toLowerCase() == 'f')
            process.exit();

        await sender.getServer().getServer().kill();
    }
}
module.exports = StopCommand;
