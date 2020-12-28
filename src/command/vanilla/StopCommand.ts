import Command from '../Command';
import Player from '../../player/Player';

export default class StopCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:stop',
            description: 'Stops a server.',
            permission: 'minecraft.command.stop'
        } as any);
    }

    execute(sender: Player, args: Array<string>): string {
        if (args[0] && args[0].toLowerCase() === 'f') process.exit();

        sender.getServer().getServer().kill();
        return 'Stopping the server...';
    }
}
