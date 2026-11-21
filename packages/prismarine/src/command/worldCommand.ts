/**
 * `/world`, which lists, creates, attaches, detaches and moves players between the server's levels
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
 *
 * The command itself is gated by `jsprismarine.command.world`, and each subcommand by a node under
 * it, `jsprismarine.command.world.<sub>`, as `/perms` is. The console may run every subcommand.
 */
import type { CommandRegistry, CommandSource, Context } from '@jsprismarine/commands';
import { arg, command, entityArgument, lit, source, stringArgument, value } from '@jsprismarine/commands';
import { select } from '@jsprismarine/commands/commands/support';
import type { SelectorModel } from '@jsprismarine/commands/selector';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type Server from '../Server';
import { SeedGenerator } from '../utils/Seed';
import { transferToLevel } from '../world/levelTransfer';
import { deferCommandWork } from './deferred';
import { playerSessionOf, refuse, sessionsOf } from './host/support';

/** The node that gates `/world`; each subcommand's node is under it. */
export const WORLD_COMMAND_PERMISSION = 'jsprismarine.command.world';

/** The subcommands, each the node under {@link WORLD_COMMAND_PERMISSION} that gates it. */
export const WORLD_SUBCOMMANDS = ['list', 'create', 'attach', 'detach', 'tp'] as const;

type WorldSubcommand = (typeof WORLD_SUBCOMMANDS)[number];

/** The node that gates a subcommand. */
export const worldSubcommandNode = (sub: WorldSubcommand): string => `${WORLD_COMMAND_PERMISSION}.${sub}`;

/** The preset a level `/world create` makes gets when the command names none. */
export const DEFAULT_CREATED_PRESET = 'minecraft:normal';

const RAN = 1;
const REFUSED = 0;

/**
 * Registers `/world`.
 *
 * @param registry - The registry the vanilla commands were built into.
 * @param server - The server whose levels the command manages.
 */
export const registerWorldCommand = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    const worlds = () => server.getWorldManager();

    /** Whether the sender may run a subcommand: the console always, a player with its node. */
    const allowed = (current: CommandSource, sub: WorldSubcommand): boolean => {
        if (current.caller === undefined) return true;
        const session = playerSessionOf(server, current.caller);
        return session !== undefined && server.getPermissionManager().can(session).execute(worldSubcommandNode(sub));
    };

    /** Runs a subcommand's work off the dispatch, after its permission check, printing each line it answers. */
    const run = (sub: WorldSubcommand, body: (context: Context, current: CommandSource) => Promise<string[]>) =>
        command((context) => {
            const current = source(context);
            if (!allowed(current, sub)) {
                current.sendError(
                    `You do not have permission to run /world ${sub}; it needs ${worldSubcommandNode(sub)}`
                );
                return REFUSED;
            }
            deferCommandWork(
                body(context, current).then(
                    (lines) => {
                        for (const line of lines) current.sendFeedback(line);
                    },
                    (error: unknown) => current.sendError(error instanceof Error ? error.message : String(error))
                )
            );
            return RAN;
        });

    const list = async (): Promise<string[]> => {
        const manager = worlds();
        const entry = manager.getEntryLevel();
        const players = (name: string) =>
            server
                .getSessionManager()
                .getSessions()
                .filter((session) => session.getWorld().getLevel().name === name).length;
        const attached = manager.getLevels().map((level) => {
            const notes = [
                level === entry ? 'entry' : undefined,
                manager.getLevelOrigin(level) === 'config' ? 'config' : undefined
            ].filter((note) => note !== undefined);
            return `  ${level.name} (${players(level.name)} online${notes.length === 0 ? '' : `, ${notes.join(', ')}`})`;
        });
        const detached = manager
            .getRegisteredLevels()
            .filter((record) => record.state === 'detached')
            .map((record) => `  ${record.name} ${record.id}`);
        return [
            `§6Attached levels (${attached.length}):`,
            ...attached,
            ...(detached.length === 0 ? [] : [`§6Detached levels (${detached.length}):`, ...detached])
        ];
    };

    const create = async (name: string, preset: string, seed?: string): Promise<string[]> => {
        const level = await worlds().createLevel(name, { preset, seed: seed ?? SeedGenerator().toString() });
        return [`Created level ${level.name} (${level.id}) with ${preset}`];
    };

    /** The players `/world tp` moves: those a selector names, or the sender. */
    const targetsOf = (current: CommandSource, selector: SelectorModel | undefined) =>
        sessionsOf(
            server,
            selector === undefined ? (current.caller === undefined ? [] : [current.caller]) : select(current, selector)
        );

    const tp = async (current: CommandSource, name: string, selector?: SelectorModel): Promise<string[]> => {
        const level = worlds().getLevel(name);
        if (level === undefined) return refuse(`No attached level is named ${name}`);
        const sessions = targetsOf(current, selector);
        if (sessions.length === 0) return refuse('No player to move');
        // Started rather than awaited: a move lands at a later input step, once its arrival is ready.
        for (const session of sessions) {
            void transferToLevel(server, session, level).catch((error: unknown) => server.getLogger().error(error));
        }
        return [`Moving ${sessions.map((session) => session.identity.name).join(', ')} to ${level.name}`];
    };

    const name = (context: Context): string => value<string>(context, 'name');

    registry.register(
        lit('world')
            .then(lit('list').executes(run('list', () => list())))
            .then(
                lit('create').then(
                    arg('name', stringArgument())
                        .executes(run('create', (context) => create(name(context), DEFAULT_CREATED_PRESET)))
                        .then(
                            arg('preset', stringArgument())
                                .executes(
                                    run('create', (context) => create(name(context), value<string>(context, 'preset')))
                                )
                                .then(
                                    arg('seed', stringArgument()).executes(
                                        run('create', (context) =>
                                            create(
                                                name(context),
                                                value<string>(context, 'preset'),
                                                value<string>(context, 'seed')
                                            )
                                        )
                                    )
                                )
                        )
                )
            )
            .then(
                lit('attach').then(
                    arg('name', stringArgument()).executes(
                        run('attach', async (context) => {
                            const level = await worlds().attachLevel(name(context));
                            return [`Attached level ${level.name} (${level.id})`];
                        })
                    )
                )
            )
            .then(
                lit('detach').then(
                    arg('name', stringArgument()).executes(
                        run('detach', async (context) => {
                            await worlds().detachLevel(name(context));
                            return [
                                `Detached level ${name(context)}; its files stay, and /world attach brings it back`
                            ];
                        })
                    )
                )
            )
            .then(
                lit('tp').then(
                    arg('name', stringArgument())
                        .executes(run('tp', (context, current) => tp(current, name(context))))
                        .then(
                            arg('targets', entityArgument({ dialect: 'bedrock' })).executes(
                                run('tp', (context, current) =>
                                    tp(current, name(context), value<SelectorModel>(context, 'targets'))
                                )
                            )
                        )
                )
            ),
        {
            description: "Lists, creates, attaches and detaches the server's levels, and moves players between them.",
            permissionLevel: CommandPermissionLevel.ANY
        }
    );
};
