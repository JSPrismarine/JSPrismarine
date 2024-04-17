import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { argument, greedyString, literal, string } from '@jsprismarine/brigadier';

import type Player from '../../Player';
import type { WorldData } from '../../world/WorldManager';
import { Command } from '../Command';

export default class DebugCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:debug',
            description: 'Debug output.',
            permission: 'jsprismarine.command.debug'
        });
    }

    public async register(dispatcher: CommandDispatcher<any>) {
        dispatcher.register(
            literal('debug')
                .then(
                    argument('action', string()).then(
                        argument('value', greedyString()).executes(async (context) => {
                            const source = context.getSource() as Player;
                            const action = context.getArgument('action') as string;
                            const value = context.getArgument('value') as string;

                            switch (action) {
                                case 'loadWorld': {
                                    const worldData = source.getServer().getConfig().getWorlds()[value] as WorldData;
                                    const world = await source
                                        .getServer()
                                        .getWorldManager()
                                        .loadWorld(worldData, value);
                                    return `Loaded world ${world.getName()}`;
                                }
                                case 'changeWorld': {
                                    const world = source.getServer().getWorldManager().getWorldByName(value)!;
                                    await source.setWorld(world);
                                    return `Moved ${source.getFormattedUsername()} to ${world.getName()}`;
                                }
                                case 'setConfig': {
                                    const config = value.split(' ')[0]!;
                                    const data = value.replace(`${config} `, '');

                                    (source.getServer().getConfig() as any)[config] = data;
                                    return `Set config ${config} to ${data}`;
                                }
                                default: {
                                    throw new Error('Invalid action!');
                                }
                            }
                        })
                    )
                )
                .executes(async (context) => {
                    const source = context.getSource() as Player;

                    const worlds = source.getServer().getWorldManager().getWorlds();
                    await source.sendMessage(`§dWorlds Loaded§r (${worlds.length}):`);
                    for (const world of worlds) {
                        await source.sendMessage(
                            `- uuid: §a${world.getUUID()}§r, name: §b${world.getName()}§r, ticks: §b${world.getTicks()}§r`
                        );

                        const gamerules = Array.from(world.getGameruleManager().getGamerules());
                        await source.sendMessage(`  §dGamerules§r (${gamerules.length}):`);
                        await Promise.all(
                            gamerules.map(async ([id, value]) => {
                                await source.sendMessage(`  - id: §a${id}§r, value: §b${value}§r`);
                            })
                        );

                        const entities = world.getEntities();
                        await source.sendMessage(`  §dEntities§r (${entities.length}):`);
                        await Promise.all(entities.map(async (e) => source.sendMessage(`  - ${e.toString()}`)));
                    }

                    await source.sendMessage(`§dConfig§r:`);
                    await source.sendMessage(`  - online-mode: ${source.getServer().getConfig().getOnlineMode()}`);
                    await source.sendMessage(`  - max-players: ${source.getServer().getConfig().getMaxPlayers()}`);
                    await source.sendMessage(`  - motd: ${source.getServer().getConfig().getMotd()}`);
                })
        );
    }
}
