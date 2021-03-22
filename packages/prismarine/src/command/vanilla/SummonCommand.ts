/* eslint-disable promise/prefer-await-to-then */
import * as Entities from '../../entity/Entities';

import { CommandDispatcher, argument, literal, string } from '@jsprismarine/brigadier';

import Command from '../Command';
import Entity from '../../entity/Entity';
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
                    const entityId = (context.getArgument('entity') as string).toLowerCase();
                    let entity: any | undefined;

                    if (!entityId.includes(':')) {
                        entity = Object.entries(Entities).find(
                            ([, value]) => value.MOB_ID === `minecraft:${entityId}`
                        )?.[1];
                    } else {
                        entity = Object.entries(Entities).find(([, value]) => value.MOB_ID === entityId)?.[1];
                    }

                    if (!entity) throw new Error(`No such entity "${entityId}"!`);

                    const mob: Entity = new entity(source.getWorld(), source.getServer());
                    await mob.setPosition(source.getPosition()); // TODO: get position from argument
                    mob.setY(mob.getY() + 0.45); // temp

                    await Promise.all(
                        source
                            .getServer()
                            .getPlayerManager()
                            .getOnlinePlayers()
                            .filter((p) => p.getWorld().getUniqueId() === source.getWorld().getUniqueId())
                            .map(async (player) => mob.sendSpawn(player))
                    );
                    const res = `Summoned ${entity.MOB_ID}`;

                    await source.sendMessage(res);
                    return res;
                })
            )
        );
    }
}
