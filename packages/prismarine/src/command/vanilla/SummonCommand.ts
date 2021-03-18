import * as Entities from '../../entity/Entities';

/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal, string } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';

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
                    const entityId = context.getArgument('entity') as string;
                    const entity = Entities.Sheep; // TODO: get mob

                    const mob = new entity(source.getWorld(), source.getServer());
                    await mob.setPosition(source.getPosition()); // TODO: get position

                    await Promise.all(
                        source
                            .getServer()
                            .getPlayerManager()
                            .getOnlinePlayers()
                            .filter((p) => p.getWorld().getUniqueId() === source.getWorld().getUniqueId())
                            .map(async (player) => mob.sendSpawn(player))
                    );
                    const res = `Summoned ${(entity.constructor as any).MOB_ID}`;

                    await source.sendMessage(res);
                    return res;
                })
            )
        );
    }
}
