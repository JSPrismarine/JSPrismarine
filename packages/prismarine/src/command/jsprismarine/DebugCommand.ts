import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';

export default class DebugCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:debug',
            description: 'Debug output',
            permission: 'jsprismarine.command.debug'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('debug').executes(async (context) => {
                const source = context.getSource() as Player;

                let message = '';
                message += `- §7Entities§r (${source
                    .getWorld()
                    .getEntities()
                    .map((e) => `§a${e.getRuntimeId()} ${e.getName()}§r`)
                    .join(', ')})`;
                message += `\n- §7Worlds§r (${source
                    .getServer()
                    .getWorldManager()
                    .getWorlds()
                    .map((w) => `§a${w.getTicks()} ${w.getName()}§r`)
                    .join(', ')})`;

                await source.sendMessage(message);
            })
        );
    }
}
