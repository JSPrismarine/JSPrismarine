import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';
import { CommandArgumentEntity, CommandArgumentPosition } from '../CommandArguments';

import { Vector3 } from '@jsprismarine/math';
import Player from '../../Player';
import MovementType from '../../network/type/MovementType';
import { Command } from '../Command';
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

export default class TpCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:tp',
            description: 'Teleports a player to a specified location or another entity.',
            aliases: ['teleport'],
            permission: 'minecraft.command.teleport'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('tp')
                .then(
                    argument('position', new CommandArgumentPosition({ name: 'destination' })).executes(
                        async (context) => {
                            // Typed as what brigadier can actually hand over, so the guard
                            // below narrows instead of being a no-op on an `as Player` cast.
                            const source = context.getSource() as CommandExecutor;

                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            const position = toBlockCentre(context.getArgument('position') as Vector3);

                            await source.setPosition({
                                position,
                                type: MovementType.Teleport
                            });
                            return `Teleported ${source.getFormattedUsername()} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                        }
                    )
                )
                .then(
                    argument('player', new CommandArgumentEntity({ name: 'victim' }))
                        .then(
                            argument('position', new CommandArgumentPosition({ name: 'destination' })).executes(
                                async (context) => {
                                    const targets = context.getArgument('player') as Player[];
                                    const position = toBlockCentre(context.getArgument('position') as Vector3);

                                    if (!targets.length)
                                        throw new Error(`Cannot find specified player(s) & entit(y/ies)`);

                                    await Promise.all(
                                        targets.map(
                                            async (entity: Player) =>
                                                await entity.setPosition({
                                                    position,
                                                    type: MovementType.Teleport
                                                })
                                        )
                                    );

                                    return `Teleported ${targets
                                        .map((entity) => entity.getFormattedUsername())
                                        .join(', ')} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                                }
                            )
                        )
                        .then(
                            argument('target', new CommandArgumentEntity({ name: 'destination' })).executes(
                                async (context) => {
                                    const sources = context.getArgument('player') as Player[];
                                    const target = context.getArgument('target')?.[0] as Player;

                                    if (!sources.length)
                                        throw new Error(`Cannot find specified player(s) & entit(y/ies)`);

                                    await Promise.all(
                                        sources.map(async (entity: Player) =>
                                            entity.setPosition({
                                                position: target.getPosition(),
                                                type: MovementType.Teleport
                                            })
                                        )
                                    );

                                    return `Teleported ${sources
                                        .map((entity) => entity.getFormattedUsername())
                                        .join(', ')} to ${target.getFormattedUsername()}`;
                                }
                            )
                        )
                        .executes(async (context) => {
                            const source = context.getSource() as CommandExecutor;
                            const target = context.getArgument('player')?.[0] as Player;

                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            await source.setPosition({
                                position: target.getPosition(),
                                type: MovementType.Teleport
                            });
                            return `Teleported ${source.getFormattedUsername()} to ${target.getFormattedUsername()}`;
                        })
                )
        );
    }
}
