/**
 * `/allowlist`, Bedrock Dedicated Server's command for the server's allow list, with Java's
 * `/whitelist` as its alias. Its tree is BDS's single overload: an `AllowListAction` verb and an
 * optional name.
 */
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import { enumArgument, stringArgument } from '../argumentTypes';
import type { CommandSource } from '../host';
import type { CommandRegistry } from '../tree';
import type { Context } from './support';
import { arg, command, lit, report, source, value } from './support';

/** The verbs of `/allowlist`, in the order Bedrock Dedicated Server's `AllowListAction` enum lists them. */
const ALLOW_LIST_ACTIONS = ['add', 'remove', 'off', 'list', 'reload', 'on'] as const;

/**
 * Runs one `/allowlist` verb, answering with the lines Bedrock Dedicated Server's console printed
 * for it in the `commands` capture. A name is optional to the parser for every verb, as it is in
 * BDS's command table: `add` and `remove` without one are refused at run time, naming nobody,
 * and the other verbs ignore it.
 */
const allowList = (context: Context, name: string): number => {
    const current = source(context);
    const list = current.host.server.allowList;
    switch (value<(typeof ALLOW_LIST_ACTIONS)[number]>(context, 'action')) {
        case 'add': {
            const added = name !== '' && list.add(name);
            return report(current, added ? 1 : 0, `${added ? 'Added' : 'Could not add'} ${name} to the allowlist`);
        }
        case 'remove': {
            const removed = name !== '' && list.remove(name);
            return report(
                current,
                removed ? 1 : 0,
                `${removed ? 'Removed' : 'Could not remove'} ${name} from the allowlist`
            );
        }
        case 'on':
            if (!list.setEnabled(true)) {
                current.sendError(
                    'Using an allowlist without online authentication can be dangerous and is not allowed.'
                );
                return 0;
            }
            // BDS's line for a list it turned on is not recorded: the capture's server does not
            // authenticate players online, so it refused. This follows its `off` line.
            return report(current, 1, 'Turned on the allowlist');
        case 'off':
            list.setEnabled(false);
            return report(current, 1, 'Turned off the allowlist');
        case 'reload':
            list.reload();
            return report(current, 1, 'Allowlist reloaded from file.');
        case 'list': {
            // BDS prints the list as a line of JSON behind `###* `, its console's machine-readable
            // form, with `null` for an empty list.
            const entries = list.entries().map((entry) => ({
                ignoresPlayerLimit: entry.ignoresPlayerLimit,
                ...(entry.name === undefined ? {} : { name: entry.name }),
                ...(entry.xuid === undefined ? {} : { xuid: entry.xuid })
            }));
            current.sendFeedback(
                `###* ${JSON.stringify({ command: 'allowlist', result: entries.length === 0 ? null : entries })}`
            );
            return entries.length;
        }
    }
};

/** Registers `/allowlist`. */
export const registerAllowList = (registry: CommandRegistry<CommandSource>): void => {
    registry.register(
        lit('allowlist').then(
            arg('action', enumArgument('AllowListAction', ALLOW_LIST_ACTIONS))
                .executes(command((context) => allowList(context, '')))
                .then(
                    arg('name', stringArgument()).executes(
                        command((context) => allowList(context, value<string>(context, 'name')))
                    )
                )
        ),
        {
            description: 'Manages the server allowlist.',
            aliases: ['whitelist'],
            permissionLevel: CommandPermissionLevel.OWNER
        }
    );
};
