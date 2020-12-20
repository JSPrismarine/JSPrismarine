import Command from '../Command';
import Player from '../../player/Player';

export default class PluginsCommand extends Command {
    constructor() {
        super({
            id: 'jsprismarine:eval',
            description: 'Execute javascript code.',
            permission: 'jsprismarine.command.eval'
        });
    }

    public async execute(sender: Player, args: Array<any>) {
        const res = await Object.getPrototypeOf(
            async function () {}
        ).constructor(args.join(' '))();
        sender.sendMessage(`Result: §e${res}`);
        return res;
    }
}
