import { spawnableEntities } from '../../entity/Entities';

import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { CommandArgumentMob, getString } from '../CommandArguments';

import Player from '../../Player';
import { Command, argument, asyncCommand, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

export default class SummonCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:summon',
            description: 'Summon an entity.',
            permission: 'minecraft.command.summon'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('summon').then(
                argument('entity', new CommandArgumentMob()) /* .then(
                    argument('position', new CommandArgumentPosition()) */
                    .executes(
                        asyncCommand(async (context) => {
                            const source = context.getSource();
                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            // const position = CommandArgumentPosition.getPosition(context, 'position');
                            const entityId = getString(context, 'entity').toLowerCase();
                            const mobId = entityId.includes(':') ? entityId : `minecraft:${entityId}`;

                            const Entity = spawnableEntities().find((value) => value.MOB_ID === mobId);
                            if (!Entity) throw new Error(`No such entity "${entityId}"!`);

                            // Summoned where the player stands.
                            const mob = new Entity({ position: source.getPosition() });
                            await source.getWorld().addEntity(mob);

                            const res = `Summoned ${Entity.MOB_ID}`;
                            await source.sendMessage(res);
                            return res;
                        })
                    )
                // )
            )
        );
    }
}
