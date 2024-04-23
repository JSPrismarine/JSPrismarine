import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, literal } from '@jsprismarine/brigadier';
import { CommandArgumentEntity, CommandArgumentPosition } from '../CommandArguments';

import type { Vector3 } from '@jsprismarine/math';
import Player from '../../Player';
import MovementType from '../../network/type/MovementType';
import { Command } from '../Command';

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
                            const source = context.getSource();

                            if (!(source instanceof Player))
                                throw new Error(`This command can't be run from the console`);

                            const position = context.getArgument('position') as Vector3;

                            if (Number.isInteger(position.getX())) {
                                if (position.getX() > 0) {
                                    position.setX(position.getX() - 0.5);
                                } else position.setX(position.getX() + 0.5);
                            }
                            if (Number.isInteger(position.getZ())) {
                                if (position.getZ() > 0) {
                                    position.setZ(position.getZ() - 0.5);
                                } else position.setZ(position.getZ() + 0.5);
                            }

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
                                    const position = context.getArgument('position') as Vector3;

                                    if (Number.isInteger(position.getX())) {
                                        if (position.getX() > 0) {
                                            position.setX(position.getX() - 0.5);
                                        } else position.setX(position.getX() + 0.5);
                                    }
                                    if (Number.isInteger(position.getZ())) {
                                        if (position.getZ() > 0) {
                                            position.setZ(position.getZ() - 0.5);
                                        } else position.setZ(position.getZ() + 0.5);
                                    }

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
                            const source = context.getSource() as Player;
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
