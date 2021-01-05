/* eslint-disable promise/prefer-await-to-then */
import {
    CommandDispatcher,
    argument,
    literal,
    string
} from '@jsprismarine/brigadier';
import Command from '../Command';
import { FloatPosition } from '../CommandArguments';
import Player from '../../player/Player';
import Vector3 from '../../math/Vector3';
import MovementType from '../../network/type/MovementType';

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
            literal('tp').then(
                argument('player', string())
                    .then(
                        argument('position', new FloatPosition()).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const target = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('player')
                                    )!;
                                const position = context.getArgument(
                                    'position'
                                ) as Vector3;

                                await target.setPosition(
                                    position,
                                    MovementType.Teleport
                                );
                                return `Teleported ${target.getFormattedUsername()} to ${position.getX()} ${position.getY()} ${position.getZ()}`;
                            }
                        )
                    )
                    .then(
                        argument('target', new FloatPosition()).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const sourcePlayer = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('player')
                                    );
                                const target = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('target')
                                    )!;
                                const position = new Vector3(
                                    target.getX(),
                                    target.getY(),
                                    target.getZ()
                                );

                                await target.setPosition(
                                    position,
                                    MovementType.Teleport
                                );
                                return `Teleported ${target.getFormattedUsername()} to ${target.getUsername()}`;
                            }
                        )
                    )
                    .executes(async (context) => {
                        const source = context.getSource() as Player;
                        const target = source
                            .getServer()
                            .getPlayerByName(context.getArgument('player'))!;

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
            )
        );
    }
}
