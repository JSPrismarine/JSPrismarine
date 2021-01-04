import { CommandDispatcher, literal } from '@jsprismarine/brigadier';
import Command from '../Command';
import Player from '../../player/Player';
export default class StopCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:stop',
            description: 'Stops a server.',
            permission: 'minecraft.command.stop'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        const execute = async (context: any) => {
            const source: Player = context.getSource();

            await source.getServer().getServer().kill();
            return 'Stopping the server...';
        };

        dispatcher.register(literal('stop').executes(execute as any));
    }
}
