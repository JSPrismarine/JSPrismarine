import * as Entities from '../../entity/Entities';

import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';
import { CommandArgumentMob } from '../CommandArguments';

import type Player from '../../Player';
import type { Entity } from '../../entity/Entity';
import { Command } from '../Command';

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
                        let Entity: any | undefined;

                        if (!entityId.includes(':')) {
                            Entity = Object.entries(Entities).find(
                                ([, value]) => value.MOB_ID === `minecraft:${entityId}`
                            )?.[1];
                        } else {
                            Entity = Object.entries(Entities).find(([, value]) => value.MOB_ID === entityId)?.[1];
                        }

                        if (!Entity) throw new Error(`No such entity "${entityId}"!`);

                        const mob: Entity = new Entity(source.getWorld(), source.getServer());
                        await source.getWorld().addEntity(mob);

                        await mob.setPosition({
                            position: source.getPosition()
                        });

                        const res = `Summoned ${Entity.MOB_ID}`;
                        await source.sendMessage(res);
                        return res;
                    })
                // )
            )
        );
    }
}
