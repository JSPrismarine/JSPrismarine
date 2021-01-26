/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal, string } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';
import Sheep from '../../entity/passive/Sheep';

export default class SummonCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:summon',
            description: 'Summon an entity.',
            permission: 'minecraft.command.summon'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('summon').then(
                argument('entity', string()).executes(async (context) => {
                    const source = context.getSource() as Player;
                    const entity = new Sheep(source.getWorld(), source.getServer()); // TODO: get mob
                    await entity.setPosition(source.getPosition()); // TODO: get positon

                    await Promise.all(
                        source
                            .getServer()
                            .getPlayerManager()
                            .getOnlinePlayers()
                            .filter(
                                (p) =>
                                    p.getWorld().getUniqueId() === source.getWorld().getUniqueId()
                            )
                            .map(async (player) => entity.sendSpawn(player))
                    );
                    const res = `Summoned ${(entity.constructor as any).MOB_ID}`;

                    await source.sendMessage(res);
                    return res;
                })
            )
        );
    }
}
