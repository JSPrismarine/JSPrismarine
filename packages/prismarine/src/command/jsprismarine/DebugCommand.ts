/* eslint-disable promise/prefer-await-to-then */
import { CommandDispatcher, argument, literal, string } from '@jsprismarine/brigadier';

import Command from '../Command';
import Player from '../../player/Player';

export default class DebugCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:debug',
            description: 'Debug output',
            permission: 'jsprismarine.command.debug'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('debug')
                .then(
                    argument('action', string()).then(
                        argument('value', string()).executes(async (context) => {
                            const source = context.getSource() as Player;
                            const action = context.getArgument('action') as string;
                            const value = context.getArgument('value') as string;

                            switch (action) {
                                case 'loadWorld':
                                    const worldData = source.getServer().getConfig().getWorlds()[value];
                                    const world = await source
                                        .getServer()
                                        .getWorldManager()
                                        .loadWorld(worldData, value);
                                    return `Loaded world ${world.getName()}`;
                                case 'changeWorld':
                                    source.setWorld(source.getServer().getWorldManager().getWorldByName(value)!);
                                default:
                                    throw new Error('Invalid action!');
                            }
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource() as Player;

                    await source.sendMessage('§dEntities:§r');
                    await Promise.all(
                        source
                            .getWorld()
                            .getEntities()
                            .map(async (e) =>
                                source.sendMessage(
                                    `- id: §a${e.getRuntimeId()}§r, name: §b${e.getName()}§r, type: §b${e.getType()}§r`
                                )
                            )
                    );

                    await source.sendMessage('§dWorlds Loaded:§r');
                    await Promise.all(
                        source
                            .getServer()
                            .getWorldManager()
                            .getWorlds()
                            .map(async (w) =>
                                source.sendMessage(
                                    `- id: §a${w.getUniqueId()}§r, name: §a${w.getName()}§r, ticks: §b${w.getTicks()}§r`
                                )
                            )
                    );

                    await source.sendMessage('§dGamerules:§r');
                    await Promise.all(
                        Array.from(source.getWorld().getGameruleManager().getGamerules()).map(async ([id, value]) =>
                            source.sendMessage(`- id: §a${id}§r, value: §b${value}§r`)
                        )
                    );
                })
        );
    }
}
