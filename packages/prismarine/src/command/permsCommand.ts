/**
 * `/perms`, which manages the groups and users of `permissions.json`
 * ([the permissions plan](../../../../docs/plans/permissions.md)).
 *
 * The command itself is gated by `jsprismarine.command.perms`, and each subcommand by a node
 * under it, `jsprismarine.command.perms.<sub>`, where `<sub>` is the subcommand's words joined
 * with dots, such as `user.permission.set`. A bare `jsprismarine.command.perms` covers every
 * subcommand, so an owner gives a moderator part of the command with the bare node and a negation
 * for each subcommand they may not use.
 */
import type { CommandRegistry, CommandSource, Context } from '@jsprismarine/commands';
import {
    arg,
    command,
    integerArgument,
    lit,
    messageArgument,
    source,
    stringArgument,
    value
} from '@jsprismarine/commands';
import { select } from '@jsprismarine/commands/commands/support';
import { parseSelector } from '@jsprismarine/commands/selector';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type Server from '../Server';
import type { Subject, SubjectKind } from '../identity/Subject';
import { isSubjectKind, parseSubject, sameSubject, subjectKey } from '../identity/Subject';
import type { NamedSubject } from '../permission/PermissionManager';
import type { Group, Membership, Node, User } from '../permission/model';
import { isExpired, parseInstant } from '../permission/model';
import { deferCommandWork } from './deferred';
import { playerSessionOf, refuse } from './host/support';

/** The node that gates `/perms`; each subcommand's node is under it. */
export const PERMS_COMMAND_PERMISSION = 'jsprismarine.command.perms';

/** The subcommands, each the node under {@link PERMS_COMMAND_PERMISSION} that gates it. */
export const PERMS_SUBCOMMANDS = [
    'user.info',
    'user.permission.set',
    'user.permission.unset',
    'user.group.add',
    'user.group.remove',
    'user.meta.set',
    'user.meta.unset',
    'group.list',
    'group.create',
    'group.delete',
    'group.info',
    'group.permission.set',
    'group.permission.unset',
    'group.parent.add',
    'group.parent.remove',
    'group.weight',
    'group.meta.set',
    'group.meta.unset',
    'reload'
] as const;

type PermsSubcommand = (typeof PERMS_SUBCOMMANDS)[number];

/** The node that gates a subcommand. */
export const permsSubcommandNode = (sub: PermsSubcommand): string => `${PERMS_COMMAND_PERMISSION}.${sub}`;

/** The command ran. */
const RAN = 1;
/** The command was refused. */
const REFUSED = 0;

/** A duration a command may write for `[expires]`, such as `30d`, in milliseconds per unit. */
const DURATION_UNITS: Readonly<Record<string, number>> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
};

/**
 * The expiry a command names: an ISO 8601 instant as the file holds it, or a duration from now
 * such as `30d`, `12h`, `45m`, `90s` or `2w`, which the file holds as the instant it ends at.
 */
const expiryOf = (raw: string, now: number): string => {
    const duration = /^(\d+)([smhdw])$/.exec(raw);
    if (duration === null) {
        // An instant is shown as the file spells it; one that is not an instant with a time zone is
        // left as written for the check to refuse.
        const at = parseInstant(raw);
        return at === undefined ? raw : new Date(at).toISOString();
    }
    const [, amount = '0', unit = 's'] = duration;
    return new Date(now + Number(amount) * (DURATION_UNITS[unit] ?? 0)).toISOString();
};

/**
 * The qualified form a target takes to pick one platform, `xbox:Steve`, or one account of a
 * platform by its key, `xbox:2535428842768200`. An offline player's key is their name.
 */
const qualified = (kind: SubjectKind, key: string): string => `${kind}:${key}`;

/** Where the command was typed by nobody in particular: the console, or a function it runs. */
const isConsole = (current: CommandSource): boolean => current.caller === undefined;

/** Splits a qualified target into its kind and name, or undefined for a name without a kind. */
const splitQualified = (raw: string): { kind: SubjectKind; name: string } | undefined => {
    const colon = raw.indexOf(':');
    if (colon < 0) return undefined;
    const kind = raw.slice(0, colon);
    return isSubjectKind(kind) ? { kind, name: raw.slice(colon + 1) } : undefined;
};

/** One line of `info` for a node or a membership, with the expiry when it has one. */
const describe = (entry: Node | Membership, now: number): string => {
    const name = 'node' in entry ? entry.node : entry.group;
    if (entry.expires === undefined) return name;
    return `${name} (${isExpired(entry, now) ? 'expired' : 'expires'} ${entry.expires})`;
};

/** The lines of a meta map, or one line saying there is none. */
const metaLines = (meta: Readonly<Record<string, string>>): string[] => {
    const entries = Object.entries(meta);
    return entries.length === 0 ? ['  (none)'] : entries.map(([key, entry]) => `  ${key} = ${entry}`);
};

/** Registers `/perms` into the registry the server dispatches. */
export const registerPermsCommand = (registry: CommandRegistry<CommandSource>, server: Server): void => {
    const permissions = () => server.getPermissionManager();

    /**
     * Whether the sender may run a subcommand. The console may run every one; a player needs the
     * subcommand's node, which the bare command node and an operator's status cover. The check
     * reads the player who typed the command, not the entity it runs as, so `execute as` lends
     * nobody another player's authority here.
     */
    const allowed = (current: CommandSource, sub: PermsSubcommand): boolean => {
        if (current.caller === undefined) return true;
        const session = playerSessionOf(server, current.caller);
        if (session === undefined) return false;
        return permissions().can(session).execute(permsSubcommandNode(sub));
    };

    /** Runs a subcommand's work off the dispatch, after its permission check, and prints each line it answers. */
    const run = (sub: PermsSubcommand, body: (context: Context, current: CommandSource) => Promise<string[]>) =>
        command((context) => {
            const current = source(context);
            if (!allowed(current, sub)) {
                current.sendError(
                    `You do not have permission to run /perms ${sub.replaceAll('.', ' ')}; it needs ${permsSubcommandNode(sub)}`
                );
                return REFUSED;
            }
            deferCommandWork(
                body(context, current).then((lines) => {
                    for (const line of lines) current.sendFeedback(line);
                })
            );
            return RAN;
        });

    /**
     * The player a `<target>` names: an online player by selector or by name, or a name the file
     * knows, in the qualified form when the name names more than one player: `kind:Name`, or
     * `kind:key` for two stored users of one kind that share a name.
     */
    const targetOf = (current: CommandSource, raw: string): NamedSubject => {
        if (raw.startsWith('@')) {
            const refs = select(current, parseSelector(raw, 'bedrock').selector);
            if (refs.length !== 1) return refuse(`${raw} must name exactly one player, and named ${refs.length}`);
            const session = playerSessionOf(server, refs[0]!);
            if (session === undefined) return refuse(`${raw} did not name a player`);
            return session.identity;
        }
        const split = splitQualified(raw);
        const name = split?.name ?? raw;
        // `xbox:2535428842768200`: the key itself, for two stored users of one kind that share a name.
        const keyed = split === undefined ? undefined : parseSubject(split.kind, split.name);
        if (keyed !== undefined) {
            // A qualified value is a key first: an online player's, or a stored user's. It reads as a
            // name only when it is nobody's key.
            const session = server
                .getSessionManager()
                .getSessions()
                .find(({ identity }) => sameSubject(identity.subject, keyed));
            if (session !== undefined) return session.identity;
            const stored = permissions().userOf(keyed);
            if (stored !== undefined) return { subject: keyed, name: stored.name };
        }
        const online = server
            .getSessionManager()
            .getSessions()
            .filter(
                ({ identity }) =>
                    identity.name === name && (split === undefined || identity.subject.kind === split.kind)
            )
            .map(({ identity }) => identity);
        const known = permissions()
            .subjectsNamed(name)
            .filter((subject) => split === undefined || subject.kind === split.kind)
            .filter((subject) => !online.some((identity) => sameSubject(identity.subject, subject)));
        const candidates = [...online, ...known.map((subject) => ({ subject, name }))];
        if (candidates.length === 1) return candidates[0]!;
        if (candidates.length === 0) {
            return refuse(
                split === undefined
                    ? `No player named ${name} is online or in permissions.json`
                    : `No ${split.kind} player named ${name} is online or in permissions.json`
            );
        }
        // Each candidate by its key, which tells two accounts of one kind apart where the name cannot.
        const forms = candidates.map(({ subject }) => qualified(subject.kind, subjectKey(subject))).join(', ');
        return refuse(`${name} names more than one player; name one of ${forms}`);
    };

    const expiry = (context: Context): string | undefined => {
        const raw = value<string | undefined>(context, 'expires');
        return raw === undefined ? undefined : expiryOf(raw, Date.now());
    };

    const target = (context: Context, current: CommandSource): NamedSubject =>
        targetOf(current, value<string>(context, 'target'));
    const groupName = (context: Context): string => value<string>(context, 'group');
    const node = (context: Context): string => value<string>(context, 'node');

    const userInfo = (player: NamedSubject): string[] => {
        const user: User | undefined = permissions().userOf(player.subject);
        const now = Date.now();
        const subject: Subject = player.subject;
        return [
            `§e${player.name}§r (${subject.kind} ${subjectKey(subject)})${permissions().isOp(subject) ? ', operator' : ''}`,
            `Groups, heaviest first: ${permissions().groupsOf(player).join(', ')}`,
            `Primary group: ${permissions().primaryGroupOf(player)}`,
            'Own groups:',
            ...(user === undefined || user.groups.length === 0
                ? ['  (none)']
                : user.groups.map((membership) => `  ${describe(membership, now)}`)),
            'Own nodes:',
            ...(user === undefined || user.nodes.length === 0
                ? ['  (none)']
                : user.nodes.map((entry) => `  ${describe(entry, now)}`)),
            'Own meta:',
            ...metaLines(user?.meta ?? {}),
            `Command level: ${permissions().commandLevelOf(player)}`
        ];
    };

    const groupInfo = (name: string): string[] => {
        const group: Group | undefined = permissions().groupOf(name);
        if (group === undefined) return refuse(`No permission group named ${name}`);
        const now = Date.now();
        return [
            `§e${name}§r, weight ${group.weight}`,
            `Parents: ${group.parents.length === 0 ? '(none)' : group.parents.join(', ')}`,
            'Nodes:',
            ...(group.nodes.length === 0 ? ['  (none)'] : group.nodes.map((entry) => `  ${describe(entry, now)}`)),
            'Meta:',
            ...metaLines(group.meta)
        ];
    };

    /** `set <node> [expires]` under a user or a group. */
    const permissionSet = (
        sub: PermsSubcommand,
        grant: (context: Context, current: CommandSource, expires?: string) => Promise<string>
    ) =>
        lit('set').then(
            arg('node', stringArgument())
                .executes(run(sub, async (context, current) => [await grant(context, current)]))
                .then(
                    arg('expires', stringArgument()).executes(
                        run(sub, async (context, current) => [await grant(context, current, expiry(context))])
                    )
                )
        );

    const withExpiry = (what: string, expires: string | undefined): string =>
        expires === undefined ? what : `${what} until ${expires}`;

    const user = arg('target', stringArgument())
        .then(lit('info').executes(run('user.info', async (context, current) => userInfo(target(context, current)))))
        .then(
            lit('permission')
                .then(
                    permissionSet('user.permission.set', async (context, current, expires) => {
                        const player = target(context, current);
                        await permissions().grantUser(player, node(context), expires);
                        return withExpiry(`Set ${node(context)} for ${player.name}`, expires);
                    })
                )
                .then(
                    lit('unset').then(
                        arg('node', stringArgument()).executes(
                            run('user.permission.unset', async (context, current) => {
                                const player = target(context, current);
                                const had = await permissions().revokeUser(player, node(context));
                                return [
                                    had
                                        ? `Unset ${node(context)} for ${player.name}`
                                        : `${player.name} does not have ${node(context)}`
                                ];
                            })
                        )
                    )
                )
        )
        .then(
            lit('group')
                .then(
                    lit('add').then(
                        arg('group', stringArgument())
                            .executes(
                                run('user.group.add', async (context, current) => {
                                    const player = target(context, current);
                                    await permissions().addToGroup(player, groupName(context));
                                    return [`Added ${player.name} to ${groupName(context)}`];
                                })
                            )
                            .then(
                                arg('expires', stringArgument()).executes(
                                    run('user.group.add', async (context, current) => {
                                        const player = target(context, current);
                                        const until = expiry(context);
                                        await permissions().addToGroup(player, groupName(context), until);
                                        return [withExpiry(`Added ${player.name} to ${groupName(context)}`, until)];
                                    })
                                )
                            )
                    )
                )
                .then(
                    lit('remove').then(
                        arg('group', stringArgument()).executes(
                            run('user.group.remove', async (context, current) => {
                                const player = target(context, current);
                                const had = await permissions().removeFromGroup(player, groupName(context));
                                return [
                                    had
                                        ? `Removed ${player.name} from ${groupName(context)}`
                                        : `${player.name} is not in ${groupName(context)}`
                                ];
                            })
                        )
                    )
                )
        )
        .then(
            lit('meta')
                .then(
                    lit('set').then(
                        arg('key', stringArgument()).then(
                            arg('value', messageArgument()).executes(
                                run('user.meta.set', async (context, current) => {
                                    const player = target(context, current);
                                    const key = value<string>(context, 'key');
                                    await permissions().setUserMeta(player, key, value<string>(context, 'value'));
                                    return [`Set ${key} for ${player.name}`];
                                })
                            )
                        )
                    )
                )
                .then(
                    lit('unset').then(
                        arg('key', stringArgument()).executes(
                            run('user.meta.unset', async (context, current) => {
                                const player = target(context, current);
                                const key = value<string>(context, 'key');
                                await permissions().setUserMeta(player, key, undefined);
                                return [`Unset ${key} for ${player.name}`];
                            })
                        )
                    )
                )
        );

    const group = lit('group')
        .then(
            lit('list').executes(
                run('group.list', async () =>
                    permissions()
                        .groupNames()
                        .map((name) => `${name} (weight ${permissions().groupOf(name)?.weight ?? 0})`)
                )
            )
        )
        .then(
            lit('create').then(
                arg('group', stringArgument()).executes(
                    run('group.create', async (context) => {
                        await permissions().createGroup(groupName(context));
                        return [`Created group ${groupName(context)}`];
                    })
                )
            )
        )
        .then(
            lit('delete').then(
                arg('group', stringArgument()).executes(
                    run('group.delete', async (context) => {
                        await permissions().deleteGroup(groupName(context));
                        return [`Deleted group ${groupName(context)}`];
                    })
                )
            )
        )
        .then(
            arg('group', stringArgument())
                .then(lit('info').executes(run('group.info', async (context) => groupInfo(groupName(context)))))
                .then(
                    lit('permission')
                        .then(
                            permissionSet('group.permission.set', async (context, _current, expires) => {
                                await permissions().grantGroup(groupName(context), node(context), expires);
                                return withExpiry(`Set ${node(context)} for group ${groupName(context)}`, expires);
                            })
                        )
                        .then(
                            lit('unset').then(
                                arg('node', stringArgument()).executes(
                                    run('group.permission.unset', async (context) => {
                                        const had = await permissions().revokeGroup(groupName(context), node(context));
                                        return [
                                            had
                                                ? `Unset ${node(context)} for group ${groupName(context)}`
                                                : `Group ${groupName(context)} does not have ${node(context)}`
                                        ];
                                    })
                                )
                            )
                        )
                )
                .then(
                    lit('parent')
                        .then(
                            lit('add').then(
                                arg('parent', stringArgument()).executes(
                                    run('group.parent.add', async (context) => {
                                        const parent = value<string>(context, 'parent');
                                        await permissions().addParent(groupName(context), parent);
                                        return [`Added ${parent} as a parent of ${groupName(context)}`];
                                    })
                                )
                            )
                        )
                        .then(
                            lit('remove').then(
                                arg('parent', stringArgument()).executes(
                                    run('group.parent.remove', async (context) => {
                                        const parent = value<string>(context, 'parent');
                                        const had = await permissions().removeParent(groupName(context), parent);
                                        return [
                                            had
                                                ? `Removed ${parent} as a parent of ${groupName(context)}`
                                                : `${parent} is not a parent of ${groupName(context)}`
                                        ];
                                    })
                                )
                            )
                        )
                )
                .then(
                    lit('weight').then(
                        arg('weight', integerArgument()).executes(
                            run('group.weight', async (context) => {
                                const weight = value<number>(context, 'weight');
                                await permissions().setGroupWeight(groupName(context), weight);
                                return [`Set the weight of ${groupName(context)} to ${weight}`];
                            })
                        )
                    )
                )
                .then(
                    lit('meta')
                        .then(
                            lit('set').then(
                                arg('key', stringArgument()).then(
                                    arg('value', messageArgument()).executes(
                                        run('group.meta.set', async (context) => {
                                            const key = value<string>(context, 'key');
                                            await permissions().setGroupMeta(
                                                groupName(context),
                                                key,
                                                value<string>(context, 'value')
                                            );
                                            return [`Set ${key} for group ${groupName(context)}`];
                                        })
                                    )
                                )
                            )
                        )
                        .then(
                            lit('unset').then(
                                arg('key', stringArgument()).executes(
                                    run('group.meta.unset', async (context) => {
                                        const key = value<string>(context, 'key');
                                        await permissions().setGroupMeta(groupName(context), key, undefined);
                                        return [`Unset ${key} for group ${groupName(context)}`];
                                    })
                                )
                            )
                        )
                )
        );

    registry.register(
        lit('perms')
            .then(lit('user').then(user))
            .then(group)
            .then(
                lit('reload').executes(
                    run('reload', async () => {
                        await permissions().reload();
                        return ['Reloaded permissions.json and ops.json'];
                    })
                )
            ),
        {
            description: 'Manages the groups and users of permissions.json.',
            permissionLevel: CommandPermissionLevel.ANY
        }
    );
};
