/**
 * `/link` and `/unlink`: a player links their Java Edition account and their Xbox account, so both
 * logins play as one player ([the plan](../../../../docs/plans/java-multiprotocol.md#linked-accounts)).
 * While `account-linking` is off they answer that it is, so turning it on needs no restart.
 */
import type { CommandRegistry, CommandSource, Context } from '@jsprismarine/commands';
import { arg, command, lit, source, stringArgument, value } from '@jsprismarine/commands';

import type Server from '../Server';
import type { LinkRefusal } from '../identity/AccountLinks';
import { LINK_CODE_LIFETIME_MS } from '../identity/AccountLinks';
import type { Subject } from '../identity/Subject';
import { accountLinksToken } from '../modules/tokens';
import type { PlayerIdentity } from '../playerIdentity';
import { deferCommandWork } from './deferred';
import { playerSessionOf } from './host/support';

/** The permission nodes the two commands are gated by, which a fresh `permissions.json` grants every player. */
export const LINK_COMMAND_PERMISSIONS = {
    link: 'jsprismarine.command.link',
    unlink: 'jsprismarine.command.unlink'
} as const;

/** The edition an account belongs to, as a player reads it. */
const editionOf = (subject: Subject): string => (subject.kind === 'java' ? 'Java Edition' : 'Bedrock Edition');

/** What a refused link says. */
const REFUSALS: Readonly<Record<LinkRefusal, string>> = {
    off: 'Account linking is off on this server.',
    unverified: 'Only an account the server verified can be linked: this server is in offline mode.',
    linked: 'This account is already linked. Use /unlink first.',
    'unknown-code': 'That code is not one this server handed out, or it has expired.',
    'same-edition': 'Link an account of the other edition: that code came from this edition.'
};

/**
 * Registers the two commands.
 * @param registry - The server's command registry.
 * @param server - The server whose links they change.
 */
export const registerLinkCommands = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    const links = () => server.getKernel().get(accountLinksToken);
    /** The identity of the player who typed the command, or undefined for the console. */
    const callerOf = (context: Context): PlayerIdentity | undefined => {
        const { caller } = source(context);
        return caller === undefined ? undefined : playerSessionOf(server, caller)?.identity;
    };
    const reply = (context: Context, run: (identity: PlayerIdentity) => Promise<string> | string): number => {
        const current = source(context);
        const identity = callerOf(context);
        if (identity === undefined) {
            current.sendFeedback('Only a player can link their accounts.');
            return 0;
        }
        deferCommandWork(Promise.resolve(run(identity)).then((message) => current.sendFeedback(message)));
        return 1;
    };

    registry.register(
        lit('link')
            .executes(
                command((context) =>
                    reply(context, (identity) => {
                        const issued = links().issueCode(identity);
                        if ('refused' in issued) return `§c${REFUSALS[issued.refused]}`;
                        const other = identity.subject.kind === 'java' ? 'Bedrock Edition' : 'Java Edition';
                        const minutes = LINK_CODE_LIFETIME_MS / 60_000;
                        return (
                            `§aYour link code is §e${issued.code}§a. Within ${minutes} minutes, join with your ${other} ` +
                            `account and type §e/link ${issued.code}§a. That account then plays as this one, with this ` +
                            `account's progress and permissions.`
                        );
                    })
                )
            )
            .then(
                arg('code', stringArgument()).executes(
                    command((context) =>
                        reply(context, async (identity) => {
                            const redeemed = await links().redeem(value<string>(context, 'code'), identity);
                            if ('refused' in redeemed) return `§c${REFUSALS[redeemed.refused]}`;
                            const { linked } = redeemed;
                            return (
                                `§aLinked to ${linked.primaryName} on ${editionOf(linked.primary)}. From your next login ` +
                                `this account plays as ${linked.primaryName}. Its own progress stays saved, and /unlink ` +
                                'brings it back.'
                            );
                        })
                    )
                )
            ),
        { description: 'Links your Java Edition and Bedrock Edition accounts into one player.' }
    );

    registry.register(
        lit('unlink').executes(
            command((context) =>
                reply(context, async (identity) =>
                    (await links().unlink(identity))
                        ? '§aUnlinked. From the next login, each account plays as itself again.'
                        : '§cThis account is not linked.'
                )
            )
        ),
        { description: 'Undoes the link between your Java Edition and Bedrock Edition accounts.' }
    );
};
