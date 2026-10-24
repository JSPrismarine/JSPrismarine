import type { CommandDispatcher } from '@jsprismarine/brigadier';

import { Command, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

export default class ListCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:list',
            description: 'Lists players on the server.',
            permission: 'minecraft.command.list'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('list').executes(async (context) => {
                const source = context.getSource();
                const players = source.getServer().getSessionManager().getAllPlayers();
                const playerArray = Array.from(players);
                const maxPlayers = source.getServer().getConfig().getMaxPlayers();
                const counter = playerArray.length;
                const answer = playerArray.map((player) => player.getName()).join(', ');

                await source.sendMessage(`There are ${counter}/${maxPlayers} players online:`);
                if (answer) await source.sendMessage(answer);
            })
        );
    }
}
