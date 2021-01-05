/* eslint-disable promise/prefer-await-to-then */
import {
    CommandArgumentEntity,
    CommandArgumentFloatPosition
} from '../CommandArguments';
import { CommandDispatcher, argument, literal } from '@jsprismarine/brigadier';
import Command from '../Command';
import MovementType from '../../network/type/MovementType';
import Player from '../../player/Player';
import Vector3 from '../../math/Vector3';

export default class TpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:tp',
            description:
                'Teleports a player to a specified location or another entity.',
            aliases: ['teleport'],
            permission: 'minecraft.command.teleport'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('tp')
                .then(
                    argument(
                        'position',
                        new CommandArgumentFloatPosition()
                    ).executes(async (context) => {
                        const source = context.getSource() as Player;

                        if (!source.isPlayer())
                            throw new Error(
                                `This command can't be run from the console`
                            );

                        const position = context.getArgument(
                            'position'
                        ) as Vector3;

                        await source.setPosition(
                            position,
                            MovementType.Teleport
                        );
                        return `Teleported ${source.getFormattedUsername()} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                    })
                )
                .then(
                    argument('player', new CommandArgumentEntity())
                        .executes(async (context) => {
                            const source = context.getSource() as Player;
                            const target = context.getArgument(
                                'player'
                            ) as Player;

                            if (!source.isPlayer())
                                throw new Error(
                                    `This command can't be run from the console`
                                );

                            await source.setPosition(
                                new Vector3(
                                    target.getX(),
                                    target.getY(),
                                    target.getZ()
                                ),
                                MovementType.Teleport
                            );
                            return `Teleported ${source.getFormattedUsername()} to ${target.getFormattedUsername()}`;
                        })
                        .then(
                            argument(
                                'position',
                                new CommandArgumentFloatPosition()
                            ).executes(async (context) => {
                                const source = context.getSource() as Player;
                                const target = context.getArgument(
                                    'player'
                                ) as Player;

                                const position = context.getArgument(
                                    'position'
                                ) as Vector3;

                                await target.setPosition(
                                    position,
                                    MovementType.Teleport
                                );
                                return `Teleported ${target.getFormattedUsername()} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                            })
                        )
                        .then(
                            argument(
                                'target',
                                new CommandArgumentEntity()
                            ).executes(async (context) => {
                                const source = context.getSource() as Player;
                                const sourcePlayer = context.getArgument(
                                    'player'
                                ) as Player;

                                const target = context.getArgument(
                                    'target'
                                ) as Player;

                                const position = new Vector3(
                                    target.getX(),
                                    target.getY(),
                                    target.getZ()
                                );

                                await sourcePlayer.setPosition(
                                    position,
                                    MovementType.Teleport
                                );
                                return `Teleported ${sourcePlayer.getFormattedUsername()} to ${target.getUsername()}`;
                            })
                        )
                )
        );
    }
}
