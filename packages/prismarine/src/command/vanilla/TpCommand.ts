import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { CommandArgumentEntity, CommandArgumentPosition } from '../CommandArguments';

import { Vector3 } from '@jsprismarine/math';
import Player from '../../Player';
import type { Entity } from '../../entity/Entity';
import MovementType from '../../network/type/MovementType';
import { Command, argument, literal } from '../Command';
import type { CommandExecutor } from '../CommandExecutor';

/**
 * Nudges whole coordinates to the middle of the block they name.
 *
 * `/tp 10 64 10` means that block, and standing in the middle of it is 10.5 - away from the
 * origin on both axes, which is why the sign is consulted rather than just adding a half.
 * @param {Vector3} position - The parsed destination.
 * @returns {Vector3} A new vector; the parsed one is left alone.
 */
const toBlockCentre = (position: Vector3): Vector3 => {
    const centre = (value: number) => (Number.isInteger(value) ? (value > 0 ? value - 0.5 : value + 0.5) : value);

    return new Vector3(centre(position.getX()), position.getY(), centre(position.getZ()));
};

/**
 * Moves an entity to a position. Only players distinguish a teleport from walking, so the
 * movement type is passed to them alone.
 */
const teleport = (entity: Entity, position: Vector3): Promise<void> =>
    entity instanceof Player
        ? entity.setPosition({ position, type: MovementType.Teleport })
        : entity.setPosition({ position });

export default class TpCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:tp',
            description: 'Teleports a player to a specified location or another entity.',
            aliases: ['teleport'],
            permission: 'minecraft.command.teleport'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('tp')
                .then(
                    argument('position', new CommandArgumentPosition({ name: 'destination' })).executes(
                        async (context) => {
                            const source = context.getSource();

                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            const position = toBlockCentre(CommandArgumentPosition.getPosition(context, 'position'));

                            await teleport(source, position);
                            return `Teleported ${source.getFormattedUsername()} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                        }
                    )
                )
                .then(
                    argument('player', new CommandArgumentEntity({ name: 'victim' }))
                        .then(
                            argument('position', new CommandArgumentPosition({ name: 'destination' })).executes(
                                async (context) => {
                                    const targets = CommandArgumentEntity.getEntities(context, 'player');
                                    const position = toBlockCentre(
                                        CommandArgumentPosition.getPosition(context, 'position')
                                    );

                                    if (!targets.length)
                                        throw new Error(`Cannot find specified player(s) & entit(y/ies)`);

                                    await Promise.all(targets.map((entity) => teleport(entity, position)));

                                    return `Teleported ${targets
                                        .map((entity) => entity.getFormattedUsername())
                                        .join(', ')} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                                }
                            )
                        )
                        .then(
                            argument('target', new CommandArgumentEntity({ name: 'destination' })).executes(
                                async (context) => {
                                    const sources = CommandArgumentEntity.getEntities(context, 'player');
                                    const target = CommandArgumentEntity.getEntities(context, 'target')[0];

                                    if (!sources.length)
                                        throw new Error(`Cannot find specified player(s) & entit(y/ies)`);
                                    if (!target) throw new Error(`Cannot find the destination player or entity`);

                                    await Promise.all(sources.map((entity) => teleport(entity, target.getPosition())));

                                    return `Teleported ${sources
                                        .map((entity) => entity.getFormattedUsername())
                                        .join(', ')} to ${target.getFormattedUsername()}`;
                                }
                            )
                        )
                        .executes(async (context) => {
                            const source = context.getSource();
                            const target = CommandArgumentEntity.getEntities(context, 'player')[0];

                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);
                            if (!target) throw new Error(`Cannot find the destination player or entity`);

                            await teleport(source, target.getPosition());
                            return `Teleported ${source.getFormattedUsername()} to ${target.getFormattedUsername()}`;
                        })
                )
        );
    }
}
