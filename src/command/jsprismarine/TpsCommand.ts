import Player from '../../player/Player';

const Command = require('../Command').default;

export default class PluginsCommand extends Command {
    constructor() {
        super({id: 'jsprismarine:tps', description: 'Get current TPS'});
    }

    public execute(sender: Player, args: Array<any>): void {
        sender.sendMessage(`TPS: §e${sender.getServer().getTPS()}`);
        return;
    }
}
