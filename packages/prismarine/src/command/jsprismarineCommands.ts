/**
 * The commands this server adds to the vanilla set: `/tps`, `/version`, `/debug`, `/ban`,
 * `/pardon`, the console's `addon`, and Bedrock Dedicated Server's `/script debugger`, `/gametest`
 * and `/scriptevent`, which the shared command set leaves out because only a server that runs
 * behavior pack scripts has a debugger to attach, GameTests to run and scripts to send an event to.
 *
 * They register into the same `CommandRegistry` as the vanilla commands, so one dispatcher
 * parses them, one flattener advertises them and `/help` lists them. Their bodies reach the
 * server directly rather than through `CommandHost`: nothing they call (the ban list, the tick
 * counters, the world manager) is part of the command layer's shared host seam, and widening that
 * seam for one server's extras would make every other host implement them.
 */
import { CommandSyntaxException } from '@jsprismarine/brigadier';
import type { CommandRegistry, CommandSource, Context } from '@jsprismarine/commands';
import {
    arg,
    command,
    integerArgument,
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
import { TPS_AVERAGE_MINUTES } from '../modules/ticker';
import { describeSupportedProtocols } from '../network/codec/describeCodecs';
import type { ScriptDebugger, ScriptDebuggerReply } from '../scripting/ScriptDebugger';
import { ScriptDebuggerMessages } from '../scripting/ScriptDebugger';
import { softwareLabel } from '../version';
import { registerAddonCommand } from './addonCommand';
import { deferCommandWork } from './deferred';
import { registerGametestCommand } from './gametestCommand';
import { resolvePlayer } from './host/support';
import { PrismarineCommandErrors } from '@jsprismarine/errors/prismarine/command';

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
    pardon: 'minecraft.command.pardon',
    addon: 'jsprismarine.command.addon'
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

/**
 * Runs a `/script debugger` action on the default level's debugger, and prints its reply as
 * feedback or as an error. A server running no behavior pack scripts has no debugger to start.
 */
const debuggerAction = (
    context: Context,
    server: Server,
    action: (scriptDebugger: ScriptDebugger) => Promise<ScriptDebuggerReply>,
    withoutScripts: ScriptDebuggerReply = {
        ok: false,
        message: `${ScriptDebuggerMessages.failed}: no behavior pack scripts are running`
    }
): number => {
    const current = source(context);
    const scriptDebugger = server.getScripts()?.debugger;
    deferCommandWork(
        (scriptDebugger === undefined ? Promise.resolve(withoutScripts) : action(scriptDebugger)).then((reply) => {
            if (reply?.ok === true) current.sendFeedback(reply.message);
            else if (reply !== undefined) current.sendError(reply.message);
        })
    );
    return RAN;
};

/**
 * One TPS average as Spigot's `/tps` prints it: green above 18, yellow above 16, red below, with a
 * `*` when the server ran faster than 20, and the figure rounded to two places and capped at 20.
 * Java prints a whole double with a trailing `.0`, so `20` reads `20.0`.
 */
const formatTps = (tps: number): string => {
    const color = tps > 18 ? '§a' : tps > 16 ? '§e' : '§c';
    const shown = Math.min(Math.round(tps * 100) / 100, 20);
    return `${color}${tps > 20 ? '*' : ''}${Number.isInteger(shown) ? shown.toFixed(1) : shown}`;
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
            throw new PrismarineCommandErrors.StartupOnlySetting({ key });
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
        const entities = world.getActors();
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
            if (!worldData) throw new PrismarineCommandErrors.UnknownConfiguredWorld({ data });
            const level = await server.getWorldManager().loadLevel(worldData, data);
            return `Loaded level ${level.name} with ${[...level.getStems().keys()].join(', ')}`;
        }
        case 'changeWorld': {
            const player = current.entity === undefined ? undefined : resolvePlayer(server, current.entity);
            if (player === undefined) throw new PrismarineCommandErrors.CommandCannotRunFromConsole();
            const world = server.getWorldManager().getWorldByName(data);
            if (!world) throw new PrismarineCommandErrors.WorldNotLoaded({ data });
            // A message the next input step carries out once the world's spawn is known.
            player.setWorld(world);
            return `Moving ${player.getFormattedUsername()} to ${world.getName()}`;
        }
        case 'setConfig': {
            const [key = '', ...rest] = data.split(' ');
            const setting = rest.join(' ');
            setConfigValue(server.getConfig(), key, setting);
            return `Set config ${key} to ${setting}`;
        }
        default:
            throw new PrismarineCommandErrors.UnknownDebugAction();
    }
};

/** Bans a name, kicking its player first when one is online. */
const ban = async (server: Server, target: string, reason?: string): Promise<string> => {
    const session = server
        .getSessionManager()
        .getSessions()
        .find(({ identity }) => identity.name === target);
    const name = session ? session.getFormattedUsername() : target;
    if (session) {
        try {
            await session.kick(
                reason === undefined
                    ? 'You have been banned!'
                    : `You have been banned from the server due to: \n\n${reason}!`
            );
        } catch (error: unknown) {
            server.getLogger().error(error);
        }
    }
    // Online, the ban names the one account; offline, it names the name until a login claims it.
    const banned = { name: target, ...(session === undefined ? {} : { subject: session.identity.subject }) };
    if (reason === undefined) await server.getBanManager().setBanned(banned);
    else await server.getBanManager().setBanned(banned, reason);
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
                const windows = TPS_AVERAGE_MINUTES.map((minutes) => `${minutes}m`).join(', ');
                const averages = server.getTPSAverages().map(formatTps).join(', ');
                source(context).sendFeedback(`§6TPS from last ${windows}: ${averages}`);
                return RAN;
            })
        ),
        {
            description:
                'This command will show TPS (ticks per second) averages of your server from the last 1, 5, and 15 minutes.'
        }
    );

    registry.register(
        lit('version').executes(
            command((context) => {
                source(context).sendFeedback(
                    `This server is running on ${softwareLabel(true)} for Minecraft: Bedrock Edition, speaking ${describeSupportedProtocols().join('; ')}`
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

    // BDS's syntax: `scriptevent <messageId> [message]`. The id needs a namespace other than
    // `minecraft`, and the message is the rest of the line, as the `script-event-console`
    // scenario recorded.
    const scriptEvent = (context: Context, message: string): number => {
        const id = value<string>(context, 'messageId');
        const current = source(context);
        const scripts = server.getScripts();
        if (scripts === undefined) {
            current.sendError('No behavior pack scripts are running to receive the event');
            return 0;
        }
        if (!scripts.scriptEvent(id, message.trimStart(), current.entity?.id)) {
            current.sendError(`The message id ${id} needs a namespace other than minecraft, such as jsp:${id}`);
            return 0;
        }
        return RAN;
    };
    registry.register(
        lit('scriptevent').then(
            arg('messageId', stringArgument())
                .executes(command((context) => scriptEvent(context, '')))
                .then(
                    arg('message', messageArgument()).executes(
                        command((context) => scriptEvent(context, value<string>(context, 'message')))
                    )
                )
        ),
        {
            description: 'Sends an event with an id and a message to the scripts of behavior packs.',
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS
        }
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

    const close = command((context) =>
        debuggerAction(context, server, (scriptDebugger) => scriptDebugger.close(), {
            ok: true,
            message: ScriptDebuggerMessages.closed
        })
    );
    // BDS's syntax: `listen <port>`, or a bare `listen` once force-inbound-debug-port is set. The
    // config is read when the command runs, so the tree is the same whatever it says.
    const portForced = (): boolean => server.getConfig().getScriptDebugger().portForced;
    const listen = lit('listen')
        .executes(
            command((context) => {
                if (!portForced()) throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherUnknownCommand().create();
                return debuggerAction(context, server, (scriptDebugger) => scriptDebugger.listen());
            })
        )
        .then(
            arg('port', integerArgument({ min: 0, max: 65_535 }))
                .requires(() => !portForced())
                .executes(
                    command((context) =>
                        debuggerAction(context, server, (scriptDebugger) =>
                            scriptDebugger.listen(value<number>(context, 'port'))
                        )
                    )
                )
        );
    // One body for each of `connect`'s overloads: no host, a host, a host and a port.
    const connect = (read: (context: Context) => [host?: string, port?: number]) =>
        command((context) =>
            debuggerAction(context, server, (scriptDebugger) => scriptDebugger.connect(...read(context)))
        );
    registry.register(
        lit('script').then(
            lit('debugger')
                .then(listen)
                .then(
                    lit('connect')
                        .executes(connect(() => []))
                        .then(
                            arg('host', stringArgument())
                                .executes(connect((context) => [value<string>(context, 'host')]))
                                .then(
                                    arg('port', integerArgument({ min: 1, max: 65_535 })).executes(
                                        connect((context) => [
                                            value<string>(context, 'host'),
                                            value<number>(context, 'port')
                                        ])
                                    )
                                )
                        )
                )
                .then(lit('close').executes(close))
                // JSPrismarine's alias of `close`, the verb the script host plan names.
                .then(lit('detach').executes(close))
        ),
        { description: 'Script debugger commands.', permissionLevel: CommandPermissionLevel.ADMIN }
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

    registerGametestCommand(registry, server);
    registerAddonCommand(registry, server);
};
