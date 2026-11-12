/**
 * The commands this server adds to the vanilla set: `/tps`, `/version`, `/debug`, `/ban` and
 * `/pardon`.
 *
 * They register into the same `CommandRegistry` as the vanilla commands, so one dispatcher
 * parses them, one flattener advertises them and `/help` lists them. Their bodies reach the
 * server directly rather than through `CommandHost`: nothing they call (the ban list, the tick
 * counters, the world manager) is part of the command layer's shared host seam, and widening that
 * seam for one server's extras would make every other host implement them.
 */
import type { CommandRegistry, CommandSource, Context } from '@jsprismarine/commands';
import {
    arg,
    command,
    lit,
    messageArgument,
    softEnumArgument,
    source,
    stringArgument,
    value
} from '@jsprismarine/commands';
import { CommandPermissionLevel, getGametypeId } from '@jsprismarine/minecraft';

import type Server from '../Server';
import type { Config } from '../config/Config';
import { describeSupportedProtocols } from '../network/codec/describeCodecs';
import { deferCommandWork } from './deferred';
import { resolvePlayer } from './host/support';

/**
 * The permission node each of these commands is gated by.
 *
 * The `jsprismarine.command.*` names are the ones the default `permissions.json` grants every
 * player, so they keep working. `/ban` and `/pardon` use the vanilla spelling, as the vanilla
 * commands do.
 */
export const JSPRISMARINE_COMMAND_PERMISSIONS: Readonly<Record<string, string>> = {
    tps: 'jsprismarine.command.tps',
    version: 'jsprismarine.command.version',
    debug: 'jsprismarine.command.debug',
    ban: 'minecraft.command.ban',
    pardon: 'minecraft.command.pardon'
};

/**
 * The soft enum `/ban` and `/pardon` complete a name from. The session fills it with the players
 * online when it sends the command list; any other name still parses, because a ban can name a
 * player who is offline.
 */
export const PLAYER_SOFT_ENUM = 'Player';

/** The command ran; the work it started is parked with {@link deferCommandWork}. */
const RAN = 1;

/** Runs async work from a synchronous body, reporting what it settles with as feedback. */
const later = (context: Context, run: (current: CommandSource) => Promise<string | undefined>): number => {
    const current = source(context);
    deferCommandWork(
        run(current).then((feedback) => {
            if (feedback !== undefined) current.sendFeedback(feedback);
        })
    );
    return RAN;
};

/** TPS colored green at 19 and above, yellow from 15, red below. */
const formatTps = (tps: number): string => {
    const color = tps >= 19 ? '§2' : tps >= 15 ? '§e' : '§4';
    return `${color}${tps.toFixed(2)}§r`;
};

/**
 * Writes one config key through its public setter.
 *
 * Only keys with a setter are accepted, so `/debug setConfig` cannot store a string in a field
 * the rest of the server reads as a number.
 * @throws Error when no setter exists for `key`.
 */
const setConfigValue = (config: Config, key: string, data: string): void => {
    switch (key) {
        case 'motd':
            config.setMotd(data);
            break;
        case 'gamemode':
            config.setGamemode(getGametypeId(data));
            break;
        default:
            throw new Error(`Config key "${key}" can't be set at runtime`);
    }
};

/** The `/debug` dump: every loaded world, its game rules and entities, and a few config values. */
const debugDump = (server: Server): string[] => {
    const levels = server.getWorldManager().getLevels();
    const worlds = levels.flatMap((level) => [...level.worlds()]);
    const lines = [`§dWorlds Loaded§r (${worlds.length}, in ${levels.length} levels):`];
    for (const world of worlds) {
        lines.push(
            `- uuid: §a${world.getUUID()}§r, name: §b${world.getName()}§r, level: §b${world.getLevel().getName()}§r, ticks: §b${world.getTicks()}§r`
        );
        const gameRules = Array.from(world.getGameRuleManager()?.getGameRules() ?? []);
        lines.push(`  §dGameRules§r (${gameRules.length}):`);
        for (const [id, rule] of gameRules) lines.push(`  - id: §a${id}§r, value: §b${rule}§r`);
        const entities = world.getEntities();
        lines.push(`  §dEntities§r (${entities.length}):`);
        for (const entity of entities) lines.push(`  - ${entity.toString()}`);
    }
    const config = server.getConfig();
    lines.push(
        '§dConfig§r:',
        `  - online-mode: ${config.getOnlineMode()}`,
        `  - max-players: ${config.getMaxPlayers()}`,
        `  - motd: ${config.getMotd()}`
    );
    return lines;
};

/** One `/debug <action> <value>` step. */
const debugAction = async (server: Server, current: CommandSource, action: string, data: string): Promise<string> => {
    switch (action) {
        case 'loadWorld': {
            const worldData = server.getConfig().getWorlds()[data];
            if (!worldData) throw new Error(`No world ${data} in config`);
            const level = await server.getWorldManager().loadLevel(worldData, data);
            return `Loaded level ${level.name} with ${[...level.getStems().keys()].join(', ')}`;
        }
        case 'changeWorld': {
            const player = current.entity === undefined ? undefined : resolvePlayer(server, current.entity);
            if (player === undefined) throw new Error(`This command can't be run from the console`);
            const world = server.getWorldManager().getWorldByName(data);
            if (!world) throw new Error(`No world ${data} is loaded`);
            await player.setWorld(world);
            return `Moved ${player.getFormattedUsername()} to ${world.getName()}`;
        }
        case 'setConfig': {
            const [key = '', ...rest] = data.split(' ');
            const setting = rest.join(' ');
            setConfigValue(server.getConfig(), key, setting);
            return `Set config ${key} to ${setting}`;
        }
        default:
            throw new Error('Invalid action!');
    }
};

/** Bans a name, kicking its player first when one is online. */
const ban = async (server: Server, target: string, reason?: string): Promise<string> => {
    const player = server
        .getSessionManager()
        .getAllPlayers()
        .find((candidate) => candidate.getName() === target);
    if (player) {
        try {
            await player.kick(
                reason === undefined
                    ? 'You have been banned!'
                    : `You have been banned from the server due to: \n\n${reason}!`
            );
        } catch (error: unknown) {
            server.getLogger().error(error);
        }
    }
    if (reason === undefined) await server.getBanManager().setBanned(target);
    else await server.getBanManager().setBanned(target, reason);
    const name = player ? player.getFormattedUsername() : target;
    return reason === undefined ? `Banned ${name}` : `Banned ${name} due to: ${reason}!`;
};

/**
 * Registers this server's own commands into the registry it dispatches.
 *
 * @param registry - The registry the vanilla commands were built into.
 * @param server - The server the bodies act on.
 */
export const registerJsprismarineCommands = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    registry.register(
        lit('tps').executes(
            command((context) => {
                source(context).sendFeedback(`TPS: ${formatTps(server.getTPS())} (Tick: ${server.getTick()})`);
                return RAN;
            })
        ),
        { description: 'Get current TPS.' }
    );

    registry.register(
        lit('version').executes(
            command((context) => {
                source(context).sendFeedback(
                    `This server is running on JSPrismarine §ev${server.getVersion()}§r for Minecraft: Bedrock Edition, speaking ${describeSupportedProtocols().join('; ')}`
                );
                return RAN;
            })
        ),
        { description: 'Displays general server information.', aliases: ['about'] }
    );

    registry.register(
        lit('debug')
            .executes(
                command((context) => {
                    const current = source(context);
                    for (const line of debugDump(server)) current.sendFeedback(line);
                    return RAN;
                })
            )
            .then(
                arg('action', stringArgument()).then(
                    arg('value', messageArgument()).executes(
                        command((context) =>
                            later(context, (current) =>
                                debugAction(
                                    server,
                                    current,
                                    value<string>(context, 'action'),
                                    value<string>(context, 'value')
                                )
                            )
                        )
                    )
                )
            ),
        { description: 'Debug output.', permissionLevel: CommandPermissionLevel.OWNER }
    );

    registry.register(
        lit('ban').then(
            arg('player', softEnumArgument(PLAYER_SOFT_ENUM))
                .executes(command((context) => later(context, () => ban(server, value<string>(context, 'player')))))
                .then(
                    arg('reason', messageArgument()).executes(
                        command((context) =>
                            later(context, () =>
                                ban(server, value<string>(context, 'player'), value<string>(context, 'reason'))
                            )
                        )
                    )
                )
        ),
        { description: 'Ban a player.', permissionLevel: CommandPermissionLevel.ADMIN }
    );

    registry.register(
        lit('pardon').then(
            arg('player', softEnumArgument(PLAYER_SOFT_ENUM)).executes(
                command((context) =>
                    later(context, async () => {
                        const target = value<string>(context, 'player');
                        await server.getBanManager().setUnbanned(target);
                        return `Unbanned ${target}`;
                    })
                )
            )
        ),
        { description: 'Pardon a player.', permissionLevel: CommandPermissionLevel.ADMIN }
    );
};
