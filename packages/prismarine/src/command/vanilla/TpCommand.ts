import { CommandArgumentEntity, CommandArgumentPosition } from '../CommandArguments';
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';

import Command from '../Command';
import MovementType from '../../network/type/MovementType';
import Player from '../../Player';
import Vector3 from '../../math/Vector3';

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
                            const source = context.getSource() as Player;

                            if (!source.isPlayer()) throw new Error(`This command can't be run from the console`);

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

                            await source.setPosition(position, MovementType.Teleport);
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

                                    if (!targets?.length)
                                        throw new Error(`Cannot find specified player(s) & entit(y/ies)`);

                                    targets.forEach(async (entity) =>
                                        entity.setPosition(position, MovementType.Teleport)
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

                                    if (!sources?.length)
                                        throw new Error(`Cannot find specified player(s) & entit(y/ies)`);
                                    sources.forEach(async (entity) =>
                                        entity.setPosition(target.getPosition(), MovementType.Teleport)
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

                            if (!source.isPlayer()) throw new Error(`This command can't be run from the console`);

                            await source.setPosition(
                                new Vector3(target.getX(), target.getY(), target.getZ()),
                                MovementType.Teleport
                            );
                            return `Teleported ${source.getFormattedUsername()} to ${target.getFormattedUsername()}`;
                        })
                )
        );
    }
}
