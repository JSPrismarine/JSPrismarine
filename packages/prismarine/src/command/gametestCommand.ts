/**
 * Bedrock Dedicated Server's `/gametest`, over the default level's GameTests: `run <testName>`,
 * `runset [tag]`, `stopall` and `clearall`. The tests a command queues start in the next script
 * flush. The other subcommands BDS lists, such as `create` and `runthese`, place or find
 * structure blocks, which this server does not have, and are left out.
 */
import type { CommandRegistry, CommandSource, Context } from '@jsprismarine/commands';
import { arg, command, lit, source, stringArgument, value } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import type { GameTestCommand } from '@jsprismarine/script-host/host/WorldScripts';

import type Server from '../Server';
import { commandLevelOf } from './host/support';

/** Runs one subcommand and prints its reply as feedback or as an error. */
const run = (context: Context, server: Server, subcommand: GameTestCommand): number => {
    const current = source(context);
    // The tests of the level the command runs in.
    const scripts = server.getScripts(commandLevelOf(server, current.dimension));
    if (scripts === undefined) {
        current.sendError('No behavior pack scripts are running, so there are no GameTests');
        return 0;
    }
    const reply = scripts.gametest(subcommand);
    if (reply.ok) current.sendFeedback(reply.message);
    else current.sendError(reply.message);
    return reply.ok ? 1 : 0;
};

/**
 * Registers `/gametest`.
 * @param registry - The registry the server's commands are in.
 * @param server - The server whose default level's scripts run the tests.
 */
export const registerGametestCommand = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    registry.register(
        lit('gametest')
            .then(
                lit('run').then(
                    arg('testName', stringArgument()).executes(
                        command((context) =>
                            run(context, server, { kind: 'run', name: value<string>(context, 'testName') })
                        )
                    )
                )
            )
            .then(
                lit('runset')
                    .executes(command((context) => run(context, server, { kind: 'runset' })))
                    .then(
                        arg('tag', stringArgument()).executes(
                            command((context) =>
                                run(context, server, { kind: 'runset', tag: value<string>(context, 'tag') })
                            )
                        )
                    )
            )
            .then(lit('stopall').executes(command((context) => run(context, server, { kind: 'stopall' }))))
            .then(lit('clearall').executes(command((context) => run(context, server, { kind: 'clearall' })))),
        { description: 'Interacts with gametest.', permissionLevel: CommandPermissionLevel.ADMIN }
    );
};
