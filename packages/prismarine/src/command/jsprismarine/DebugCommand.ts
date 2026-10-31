import type { CommandDispatcher } from '@jsprismarine/brigadier';
import { greedyString, string } from '@jsprismarine/brigadier';
import { getGametypeId } from '@jsprismarine/minecraft';

import Player from '../../Player';
import type { Config } from '../../config/Config';
import { Command, argument, asyncCommand, literal } from '../Command';
import { getString } from '../CommandArguments';
import type { CommandExecutor } from '../CommandExecutor';

/**
 * Writes one config key through its public setter.
 *
 * Only keys with a setter are accepted, so a debug command cannot store a string in a field the
 * rest of the server reads as a number.
 * @throws Error when no setter exists for `key`.
 */
const setConfigValue = (config: Config, key: string, value: string): void => {
    switch (key) {
        case 'motd':
            config.setMotd(value);
            break;
        case 'gamemode':
            config.setGamemode(getGametypeId(value));
            break;
        default:
            throw new Error(`Config key "${key}" can't be set at runtime`);
    }
};

export default class DebugCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:debug',
            description: 'Debug output.',
            permission: 'jsprismarine.command.debug'
        });
    }

    public async register(dispatcher: CommandDispatcher<CommandExecutor>) {
        dispatcher.register(
            literal('debug')
                .then(
                    argument('action', string()).then(
                        argument('value', greedyString()).executes(
                            asyncCommand(async (context) => {
                                const source = context.getSource();
                                const action = getString(context, 'action');
                                const value = getString(context, 'value');

                                switch (action) {
                                    case 'loadWorld': {
                                        const worldData = source.getServer().getConfig().getWorlds()[value];
                                        if (!worldData) throw new Error(`No world ${value} in config`);

                                        const level = await source
                                            .getServer()
                                            .getWorldManager()
                                            .loadLevel(worldData, value);
                                        return `Loaded level ${level.name} with ${[...level.getStems().keys()].join(', ')}`;
                                    }
                                    case 'changeWorld': {
                                        if (!(source instanceof Player))
                                            throw new Error(`This command can't be run from the console`);

                                        const world = source.getServer().getWorldManager().getWorldByName(value);
                                        if (!world) throw new Error(`No world ${value} is loaded`);

                                        await source.setWorld(world);
                                        return `Moved ${source.getFormattedUsername()} to ${world.getName()}`;
                                    }
                                    case 'setConfig': {
                                        const [key = '', ...rest] = value.split(' ');
                                        const data = rest.join(' ');

                                        setConfigValue(source.getServer().getConfig(), key, data);
                                        return `Set config ${key} to ${data}`;
                                    }
                                    default: {
                                        throw new Error('Invalid action!');
                                    }
                                }
                            })
                        )
                    )
                )
                .executes(
                    asyncCommand(async (context) => {
                        const source = context.getSource();

                        const levels = source.getServer().getWorldManager().getLevels();
                        const worlds = levels.flatMap((level) => [...level.worlds()]);
                        await source.sendMessage(`§dWorlds Loaded§r (${worlds.length}, in ${levels.length} levels):`);
                        for (const world of worlds) {
                            await source.sendMessage(
                                `- uuid: §a${world.getUUID()}§r, name: §b${world.getName()}§r, level: §b${world.getLevel().getName()}§r, ticks: §b${world.getTicks()}§r`
                            );

                            const gameRules = Array.from(world.getGameRuleManager()?.getGameRules() || []);
                            await source.sendMessage(`  §dGameRules§r (${gameRules.length}):`);
                            await Promise.all(
                                gameRules.map(async ([id, value]) => {
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
                )
        );
    }
}
