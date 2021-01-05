/* eslint-disable promise/prefer-await-to-then */
import {
    CommandDispatcher,
    argument,
    literal,
    string
} from '@jsprismarine/brigadier';
import Command from '../Command';
import Player from '../../player/Player';
import Vector3 from '../../math/Vector3';
import { FloatPosition } from '../CommandArguments';

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
                                    );
                                const position = context.getArgument(
                                    'position'
                                ) as Vector3;

                                console.log(position);
                            }
                        )
                    )
                    .then(
                        argument('target', new FloatPosition()).executes(
                            async (context) => {
                                const source = context.getSource() as Player;
                                const sourcetPlayert = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('player')
                                    );
                                const target = source
                                    .getServer()
                                    .getPlayerByName(
                                        context.getArgument('target')
                                    );
                                const position = context.getArgument(
                                    'position'
                                ) as Vector3;

                                console.log(position);
                            }
                        )
                    )
            )
        );
    }
}
