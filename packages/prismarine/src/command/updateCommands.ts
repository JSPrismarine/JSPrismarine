/**
 * `update check` and `restart`, the console's commands for updating the server. Only the console
 * runs them by default. A player runs one only when a permission entry names its node exactly:
 * an operator's `*` does not count, since restarting the server is the host owner's decision.
 */
import type { CommandRegistry, CommandSource } from '@jsprismarine/commands';
import { command, lit, source } from '@jsprismarine/commands';

import type Server from '../Server';
import { updatesToken } from '../modules/tokens';
import { describeUpdateStatus } from '../updates/status';
import { serverVersion } from '../version';
import { isConsoleSource } from './consoleSource';
import { deferCommandWork } from './deferred';
import { playerSessionOf } from './host/support';

/** The node each of these commands is gated by, which a player must hold by name. */
export const CONSOLE_FIRST_COMMAND_PERMISSIONS = {
    update: 'jsprismarine.command.update',
    restart: 'jsprismarine.command.restart'
} as const;

const CONSOLE_FIRST_NODES: ReadonlyMap<string, string> = new Map(Object.entries(CONSOLE_FIRST_COMMAND_PERMISSIONS));

/** The node of a command only the console runs by default, or undefined for any other command. */
export const consoleFirstNodeOf = (name: string): string | undefined => CONSOLE_FIRST_NODES.get(name);

/** A player as {@link namesNode} reads them. */
export interface NodeHolder {
    getPermissions(): string[];
    hasPermission(node: string): boolean;
}

/**
 * Whether a player holds a node that a permission entry names exactly, rather than through a
 * wildcard such as the `*` every operator holds.
 */
export const namesNode = (player: NodeHolder, node: string): boolean =>
    player.getPermissions().includes(node) && player.hasPermission(node);

/** Whether a command source is the console, or a player who holds the node by name. */
const consoleOrNamed =
    (server: Server, node: string) =>
    (current: CommandSource): boolean => {
        if (isConsoleSource(current)) return true;
        if (current.caller === undefined) return false;
        const player = playerSessionOf(server, current.caller);
        return player !== undefined && namesNode(player, node);
    };

/**
 * Registers `update check` and `restart` into the registry the server dispatches.
 * @param server - The server they act on, read when a command runs.
 */
export const registerUpdateCommands = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    registry.register(
        lit('update')
            .requires(consoleOrNamed(server, CONSOLE_FIRST_COMMAND_PERMISSIONS.update))
            .then(
                lit('check').executes(
                    command((context) => {
                        const current = source(context);
                        deferCommandWork(
                            server
                                .getKernel()
                                .get(updatesToken)
                                .check()
                                .then((status) => current.sendFeedback(describeUpdateStatus(status, serverVersion())))
                        );
                        return 1;
                    })
                )
            ),
        { description: 'Checks for a newer JSPrismarine now. Only the console runs it by default.' }
    );

    registry.register(
        lit('restart')
            .requires(consoleOrNamed(server, CONSOLE_FIRST_COMMAND_PERMISSIONS.restart))
            .executes(
                command((context) => {
                    const current = source(context);
                    if (server.requestRestart()) {
                        current.sendFeedback('Restarting the server');
                        return 1;
                    }
                    current.sendError(
                        'This server has no host process to start it again, so it cannot restart. Use /stop and start it again.'
                    );
                    return 0;
                })
            ),
        { description: 'Stops the server and starts it again in a new process. Only the console runs it by default.' }
    );
};
