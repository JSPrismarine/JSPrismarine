import * as Entities from '../../entity/Entities';

import { CommandArgumentMob } from '../CommandArguments';
import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';

import { Command } from '../Command';
import type { Entity } from '../../entity/Entity';
import type Player from '../../Player';
import Vector3 from '../../math/Vector3';

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
                argument('entity', new CommandArgumentMob()) /* .then(
                    argument('position', new CommandArgumentPosition()) */
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        // const position = context.getArgument('position') as Vector3;
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
                        await source.getWorld().addEntity(mob);
                        await mob.setPosition(new Vector3(source.getX(), source.getY() - 1.6, source.getZ()));

                        const res = `Summoned ${entity.MOB_ID}`;
                        await source.sendMessage(res);
                        return res;
                    })
                // )
            )
        );
    }
}
