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

    public async execute(
        sender: Player,
        args: Array<string | number>
    ): Promise<string> {
        if (typeof args[0] === 'string' && args[0].toLowerCase() === 'f')
            process.exit();

        await sender.getServer().getServer().kill();
        return 'Stopping the server...';
    }
}
