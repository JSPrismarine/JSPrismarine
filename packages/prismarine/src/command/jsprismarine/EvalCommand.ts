import Command from '../Command';
import Player from '../../player/Player';

export default class PluginsCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:eval',
            description: 'Execute javascript code.',
            permission: 'jsprismarine.command.eval'
        });
    }

    public async execute(sender: Player, args: any[]) {
        const res = await Object.getPrototypeOf(async () => {}).constructor(args.join(' '))();
        await sender.sendMessage(`Result: §e${res}`);
        return res;
    }
}
