import { CommandDispatcher, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';

export default class ListCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:list',
            description: 'Lists players on the server.',
            permission: 'minecraft.command.list'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('list').executes(async (context) => {
                const source = context.getSource() as Player;
                const players = source
                    .getServer()
                    .getPlayerManager()
                    .getOnlinePlayers();
                const playerArray = Array.from(players);
                const maxPlayers = source
                    .getServer()
                    .getRaknet()
                    .getName()
                    .getMaxPlayerCount();
                const counter = playerArray.length;
                const answer = playerArray
                    .map((player) => player.getUsername())
                    .join(', ');

                await source.sendMessage(
                    `There are ${counter}/${maxPlayers} players online:`
                );
                if (answer) await source.sendMessage(answer);
            })
        );
    }
}
