/**
 * The chat and administration commands: `/say`, `/me`, `/tell`, `/tellraw`,
 * `/title`, `/op`, `/deop`, `/kick`, `/list`, `/stop`, `/reload`,
 * `/transfer`, `/help` and `/recipe`.
 *
 * Bedrock splits plain text from rich text where Java does not: `/tell` takes
 * a message and `/tellraw` takes a `rawtext` object, and the same split
 * applies to `/title` against `/titleraw`. The trees here keep the split,
 * because it is what the client parses.
 */
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import {
    entityArgument,
    enumArgument,
    integerArgument,
    messageArgument,
    rawTextArgument,
    stringArgument
} from '../argumentTypes';
import type { CommandSource } from '../host';
import type { CommandRegistry } from '../tree';
import type { Context } from './support';
import { arg, command, lit, report, select, selectOne, source, value } from './support';

const ADMIN = { permissionLevel: CommandPermissionLevel.ADMIN } as const;
const OWNER = { permissionLevel: CommandPermissionLevel.OWNER } as const;

/** Registers the 14 chat and administration commands. */
export const registerServerCommands = (registry: CommandRegistry<CommandSource>): void => {
    registry.register(
        lit('say').then(
            arg('message', messageArgument()).executes(
                command((context) => {
                    const current = source(context);
                    current.host.server.sendMessage(
                        current.host.server.listPlayers(),
                        'chat',
                        `[${current.entity?.name ?? 'Server'}] ${value<string>(context, 'message')}`
                    );
                    return 1;
                })
            )
        ),
        { description: 'Sends a message to everyone.', permissionLevel: CommandPermissionLevel.GAME_DIRECTORS }
    );

    registry.register(
        lit('me').then(
            arg('message', messageArgument()).executes(
                command((context) => {
                    const current = source(context);
                    current.host.server.sendMessage(
                        current.host.server.listPlayers(),
                        'emote',
                        `${current.entity?.name ?? 'Server'} ${value<string>(context, 'message')}`
                    );
                    return 1;
                })
            )
        ),
        { description: 'Sends an action message.' }
    );

    registry.register(
        lit('tell').then(
            arg('targets', entityArgument()).then(
                arg('message', messageArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const targets = select(current, value(context, 'targets'));
                        current.host.server.sendMessage(targets, 'whisper', value(context, 'message'));
                        return report(current, targets.length, `Told ${targets.length} players`);
                    })
                )
            )
        ),
        { description: 'Sends a private message.', aliases: ['msg', 'w'] }
    );

    registry.register(
        lit('tellraw').then(
            arg('targets', entityArgument()).then(
                arg('raw', rawTextArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const targets = select(current, value(context, 'targets'));
                        current.host.server.sendMessage(targets, 'raw', value(context, 'raw'));
                        return report(current, targets.length, `Told ${targets.length} players`);
                    })
                )
            )
        ),
        { description: 'Sends a rawtext message.', permissionLevel: CommandPermissionLevel.GAME_DIRECTORS }
    );

    registry.register(
        lit('title').then(
            arg('targets', entityArgument())
                .then(
                    arg('kind', enumArgument('TitleKind', ['title', 'subtitle', 'actionbar'] as const)).then(
                        arg('text', messageArgument()).executes(
                            command((context) => {
                                const current = source(context);
                                const targets = select(current, value(context, 'targets'));
                                current.host.server.sendTitle(targets, value(context, 'kind'), value(context, 'text'));
                                return report(current, targets.length, `Showed a title to ${targets.length} players`);
                            })
                        )
                    )
                )
                .then(
                    arg('action', enumArgument('TitleAction', ['clear', 'reset'] as const)).executes(
                        command((context) => {
                            const current = source(context);
                            const targets = select(current, value(context, 'targets'));
                            current.host.server.sendTitle(targets, value(context, 'action'), '');
                            return report(current, targets.length, `Cleared the title for ${targets.length} players`);
                        })
                    )
                )
        ),
        {
            description: 'Shows a title, subtitle or action bar.',
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS
        }
    );

    registry.register(
        lit('op').then(arg('targets', entityArgument()).executes(command((context) => operators(context, true)))),
        { description: 'Grants operator status.', ...OWNER }
    );

    registry.register(
        lit('deop').then(arg('targets', entityArgument()).executes(command((context) => operators(context, false)))),
        { description: 'Revokes operator status.', ...OWNER }
    );

    registry.register(
        lit('kick').then(
            arg('target', entityArgument())
                .executes(command((context) => kick(context, 'Kicked by an operator')))
                .then(
                    arg('reason', messageArgument()).executes(
                        command((context) => kick(context, value<string>(context, 'reason')))
                    )
                )
        ),
        { description: 'Removes a player from the server.', ...ADMIN }
    );

    registry.register(
        lit('list').executes(
            command((context) => {
                const current = source(context);
                const players = current.host.server.listPlayers();
                current.sendFeedback(`There are ${players.length} players online`);
                return players.length;
            })
        ),
        { description: 'Lists the players online.' }
    );

    registry.register(
        lit('stop').executes(
            command((context) => {
                const current = source(context);
                current.host.server.stop();
                return report(current, 1, 'Stopping the server');
            })
        ),
        { description: 'Stops the server.', ...OWNER }
    );

    registry.register(
        lit('reload').executes(
            command((context) => {
                const current = source(context);
                current.host.server.reload();
                return report(current, 1, 'Reloaded');
            })
        ),
        { description: 'Reloads the server data.', ...ADMIN }
    );

    registry.register(
        lit('transfer').then(
            arg('host', stringArgument()).then(
                arg('port', integerArgument({ min: 1, max: 65_535 }))
                    .executes(command((context) => transfer(context, false)))
                    .then(arg('targets', entityArgument()).executes(command((context) => transfer(context, true))))
            )
        ),
        { description: 'Sends players to another server.', ...ADMIN }
    );

    registry.register(
        lit('help')
            .executes(
                command((context) => {
                    const current = source(context);
                    const lines = current.host.server.usage();
                    for (const line of lines) current.sendFeedback(line);
                    return lines.length;
                })
            )
            .then(
                arg('command', stringArgument()).executes(
                    command((context) => {
                        const current = source(context);
                        const lines = current.host.server.usage(value(context, 'command'));
                        for (const line of lines) current.sendFeedback(line);
                        return lines.length;
                    })
                )
            ),
        { description: 'Lists the commands you may run.' }
    );

    registry.register(
        lit('recipe')
            .then(
                lit('give').then(
                    arg('targets', entityArgument()).then(
                        arg('recipe', stringArgument()).executes(command((context) => recipes(context, true)))
                    )
                )
            )
            .then(
                lit('take').then(
                    arg('targets', entityArgument()).then(
                        arg('recipe', stringArgument()).executes(command((context) => recipes(context, false)))
                    )
                )
            ),
        { description: 'Unlocks or locks recipes.', permissionLevel: CommandPermissionLevel.GAME_DIRECTORS }
    );
};

const operators = (context: Context, grant: boolean): number => {
    const current = source(context);
    const changed = select(current, value(context, 'targets')).filter((entity) =>
        grant ? current.host.server.addOperator(entity) : current.host.server.removeOperator(entity)
    ).length;
    return report(current, changed, `${grant ? 'Opped' : 'Deopped'} ${changed} players`);
};

const kick = (context: Context, reason: string): number => {
    const current = source(context);
    const player = selectOne(current, value(context, 'target'));
    const kicked = current.host.server.kick(player, reason);
    return report(current, kicked ? 1 : 0, `Kicked ${player.name}`);
};

const transfer = (context: Context, hasTargets: boolean): number => {
    const current = source(context);
    const targets = hasTargets
        ? select(current, value(context, 'targets'))
        : current.entity === undefined
          ? []
          : [current.entity];
    const moved = targets.filter((entity) =>
        current.host.server.transfer(entity, value(context, 'host'), value(context, 'port'))
    ).length;
    return report(current, moved, `Transferred ${moved} players`);
};

const recipes = (context: Context, give: boolean): number => {
    const current = source(context);
    const changed = current.host.server.recipes(
        select(current, value(context, 'targets')),
        value(context, 'recipe'),
        give
    );
    return report(current, changed, `${give ? 'Unlocked' : 'Locked'} ${changed} recipes`);
};
