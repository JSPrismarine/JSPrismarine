/**
 * `permissions.json` on disk: how the current layout is read, the steps that bring an older file
 * to it, and the paths each write edits in place so comments survive
 * ([the permissions plan](../../../../docs/plans/permissions.md)).
 */
import type { ConfigDocument, ConfigPath } from '../config/ConfigDocument';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { FileMigrations } from '../config/FileMigrations';
import type { PermissionGroupJson, PermissionsFile } from '../config/JsonConfigTypes';
import type { Subject } from '../identity/Subject';
import { SUBJECT_KINDS, parseSubject, subjectId, subjectKey } from '../identity/Subject';
import { isRecord } from '../utils/isRecord';
import { isStringList } from '../utils/isStringList';
import type { Group, User } from './model';
import {
    DEFAULT_GROUP,
    EVERY_NODE,
    groupJson,
    longerLived,
    mergeEntries,
    OPERATOR_GROUP,
    readGroup,
    readUser,
    userJson
} from './model';
import { wouldCycle } from './resolve';

/** The layout this server reads and writes. */
export const PERMISSIONS_SCHEMA_VERSION = 3 as const;

/** The nodes version 3 adds to the `default` group, of a fresh file and of an existing one alike. */
export const VERSION_3_DEFAULT_PERMISSIONS = ['jsprismarine.command.link', 'jsprismarine.command.unlink'] as const;

/** The permissions a fresh `permissions.json` grants every player, as the `default` group's nodes. */
export const DEFAULT_PLAYER_PERMISSIONS: readonly string[] = [
    'minecraft.command.help',
    'minecraft.command.list',
    'minecraft.command.me',
    'jsprismarine.command.plugins',
    'jsprismarine.command.version',
    'jsprismarine.command.tps',
    ...VERSION_3_DEFAULT_PERMISSIONS
];

/** A user the file knows, with the subject it is filed under. */
export interface FiledUser {
    readonly subject: Subject;
    readonly user: User;
}

/** What a `permissions.json` holds, read into memory. */
export interface LoadedPermissions {
    readonly groups: Map<string, Group>;
    /** By {@link subjectId}. */
    readonly users: Map<string, FiledUser>;
    /** Users still keyed by a login UUID, by that UUID. */
    readonly pending: Map<string, User>;
}

/** The path of a user's record in the file. */
export const userPath = (subject: Subject): ConfigPath => ['users', subject.kind, subjectKey(subject)];

/** The path of a group's record in the file. */
export const groupPath = (name: string): ConfigPath => ['groups', name];

/** The groups a fresh file starts with, or the two built-in groups with the nodes a migration gives them. */
const builtInGroups = (
    defaults: readonly string[] = DEFAULT_PLAYER_PERMISSIONS,
    operator: readonly string[] = [EVERY_NODE]
): Record<string, PermissionGroupJson> => ({
    [DEFAULT_GROUP]: { weight: 0, parents: [], nodes: defaults.map((node) => ({ node })), meta: {} },
    [OPERATOR_GROUP]: { weight: 100, parents: [], nodes: operator.map((node) => ({ node })), meta: {} }
});

/** Writes the current layout's keys into an empty document, each explained. */
const writeLayout = (document: ConfigDocument, groups: Record<string, PermissionGroupJson>): void => {
    document.set(
        ['schemaVersion'],
        PERMISSIONS_SCHEMA_VERSION,
        'The layout of this file. The server migrates a file written before it had one.'
    );
    document.set(
        ['groups'],
        groups,
        [
            'Every group by name. A group has a weight, parent groups, nodes and meta.',
            "A heavier group decides before a lighter one; a user's own nodes decide before any group.",
            'A node is `scope.name`, `scope.*` for a whole scope or `*` for everything; a leading `-` negates.',
            'Every player holds `default`, and every operator holds `operator`.'
        ].join('\n')
    );
    document.set(
        ['users'],
        { xbox: {}, java: {}, offline: {} },
        [
            'Users by platform: `xbox` by XUID, `java` by Mojang profile UUID, `offline` by name.',
            'A user has groups, nodes and meta of their own. `/perms user <name> info` shows one.'
        ].join('\n')
    );
};

/** What a server without a `permissions.json` starts with. */
export const defaultPermissionsDocument = (): ConfigDocument => {
    const document = parseConfigDocument('{}');
    writeLayout(document, builtInGroups());
    return document;
};

/** A user as a version 1 `players` entry, with the UUID that keyed it. */
export interface LegacyPlayer {
    readonly name: string;
    readonly uuid: string;
    readonly permissions: readonly string[];
}

/**
 * The `players` entries of a version 1 file that have a name, a UUID and a permission list, one
 * per UUID: the last valid entry, which is the one the version 1 loader read, so a grant an
 * earlier entry held and a later one dropped does not come back.
 */
export const legacyPlayersOf = (root: Record<string, unknown>): LegacyPlayer[] => {
    const byUuid = new Map<string, LegacyPlayer>();
    for (const player of Array.isArray(root.players) ? root.players : []) {
        if (
            isRecord(player) &&
            typeof player.name === 'string' &&
            typeof player.uuid === 'string' &&
            isStringList(player.permissions)
        ) {
            byUuid.set(player.uuid, { name: player.name, uuid: player.uuid, permissions: player.permissions });
        }
    }
    return [...byUuid.values()];
};

/**
 * The version 2 document a version 1 file becomes: `defaultPermissions` as the `default` group's
 * nodes, `defaultOperatorPermissions` as `operator`'s, and each `players` entry under `pending`
 * with its UUID as `legacyUuid`, until a login with that UUID claims it. A `defaultPermissions`
 * that is missing or not a list of strings read as no permissions before, and still does; a
 * `defaultOperatorPermissions` that is gives `operator` `*`, as a fresh file does. The migration
 * runner sets `schemaVersion` to 2 afterwards, and the later steps run on the result.
 */
export const migrateLegacyPermissions = (root: Record<string, unknown>): ConfigDocument => {
    const document = parseConfigDocument('{}');
    writeLayout(
        document,
        builtInGroups(
            isStringList(root.defaultPermissions) ? root.defaultPermissions : [],
            isStringList(root.defaultOperatorPermissions) ? root.defaultOperatorPermissions : undefined
        )
    );
    const pending = legacyPlayersOf(root).map(({ name, uuid, permissions }) => ({
        name,
        legacyUuid: uuid,
        groups: [],
        nodes: permissions.map((node) => ({ node })),
        meta: {}
    }));
    if (pending.length > 0) {
        document.set(
            ['pending'],
            pending,
            [
                'Players the old file keyed by login UUID. Each waits here until a login with its',
                '`legacyUuid` claims it, which files the user under their platform and drops the UUID.'
            ].join('\n')
        );
    }
    return document;
};

/**
 * Gives the `default` group of an existing file each of these nodes it does not name yet, after
 * the nodes it has. A node the group already names, granted or negated, stays as the owner wrote
 * it, and no other group changes. A file without `default`, or with a `nodes` that is not a list,
 * is left alone: the loader reads the first as a fresh file's group, which holds them already, and
 * skips the second.
 */
export const grantDefaultNodes = (document: ConfigDocument, nodes: readonly string[]): void => {
    const at = [...groupPath(DEFAULT_GROUP), 'nodes'];
    const held = document.get(at);
    if (!Array.isArray(held)) return;
    const named = new Set(
        held.flatMap((entry) =>
            isRecord(entry) && typeof entry.node === 'string' ? [entry.node.replace(/^-/, '')] : []
        )
    );
    let index = held.length;
    for (const node of nodes) {
        if (!named.has(node)) document.set([...at, index++], { node });
    }
};

/** The name of the file. */
export const PERMISSIONS_FILE_NAME = 'permissions.json';

/**
 * How `permissions.json` upgrades. A file without `schemaVersion` is the version 1 layout, with
 * `defaultPermissions`, `defaultOperatorPermissions` and `players`.
 */
export const PERMISSIONS_MIGRATIONS: FileMigrations = {
    fileName: PERMISSIONS_FILE_NAME,
    unversioned: 1,
    current: PERMISSIONS_SCHEMA_VERSION,
    steps: [
        {
            // Groups and users filed by platform, with the old players pending under their UUID.
            to: 2,
            migrate: (document) => {
                const root = document.get([]);
                return migrateLegacyPermissions(isRecord(root) ? root : {});
            }
        },
        {
            // `/link` and `/unlink` are for every player.
            to: 3,
            migrate: (document) => {
                grantDefaultNodes(document, VERSION_3_DEFAULT_PERMISSIONS);
                return undefined;
            }
        }
    ]
};

/** Whether a parsed file is at the layout this server reads, the one {@link readPermissions} takes. */
export const isCurrentLayout = (root: Record<string, unknown>): boolean =>
    root.schemaVersion === PERMISSIONS_SCHEMA_VERSION;

/** A built-in group as a fresh file writes it, for a file that lacks one. */
export const builtInGroup = (name: typeof DEFAULT_GROUP | typeof OPERATOR_GROUP): Group =>
    readGroup(builtInGroups()[name]);

/**
 * A current document holding this state, for an edit when the file on disk is gone or no longer
 * at the current layout.
 */
export const documentOf = (loaded: LoadedPermissions, now: number): ConfigDocument => {
    const document = parseConfigDocument('{}');
    writeLayout(document, Object.fromEntries([...loaded.groups].map(([name, group]) => [name, groupJson(group, now)])));
    for (const { subject, user } of loaded.users.values()) document.set(userPath(subject), userJson(user, now));
    if (loaded.pending.size > 0) {
        document.set(
            ['pending'],
            [...loaded.pending].map(([legacyUuid, user]) => ({ ...userJson(user, now), legacyUuid }))
        );
    }
    return document;
};

/** A parent link the loader dropped because it would make a group its own ancestor. */
export interface DroppedParent {
    readonly group: string;
    readonly parent: string;
}

/**
 * Drops each parent link that closes a cycle, so no group is its own ancestor. The resolver would
 * end on a cycle anyway; the loader refuses one so the file says what resolution does.
 * @returns The links dropped, for the log.
 */
export const dropParentCycles = (groups: Map<string, Group>): DroppedParent[] => {
    const dropped: DroppedParent[] = [];
    for (const [name, group] of groups) {
        const kept = group.parents.filter((parent) => {
            if (!wouldCycle(name, parent, (candidate) => groups.get(candidate))) return true;
            dropped.push({ group: name, parent });
            return false;
        });
        if (kept.length !== group.parents.length) groups.set(name, { ...group, parents: kept });
    }
    return dropped;
};

/**
 * Reads a current document into memory. A section or an entry that does not have the shape the
 * file declares is skipped, so one bad line does not refuse the file.
 */
export const readPermissions = (root: Record<string, unknown>): LoadedPermissions => {
    const groups = new Map<string, Group>();
    if (isRecord(root.groups)) {
        for (const [name, value] of Object.entries(root.groups)) groups.set(name, readGroup(value));
    }
    const users = new Map<string, FiledUser>();
    if (isRecord(root.users)) {
        for (const kind of SUBJECT_KINDS) {
            const section = root.users[kind];
            if (!isRecord(section)) continue;
            for (const [key, value] of Object.entries(section)) {
                const subject = parseSubject(kind, key);
                const user = readUser(value);
                if (subject !== undefined && user !== undefined) users.set(subjectId(subject), { subject, user });
            }
        }
    }
    const pending = new Map<string, User>();
    if (Array.isArray(root.pending)) {
        for (const value of root.pending) {
            const user = readUser(value);
            if (user === undefined || !isRecord(value) || typeof value.legacyUuid !== 'string') continue;
            // Two entries under one UUID are one user: a claim files everything both hold, and of
            // a node or a membership both hold, the one that applies longer, so an expired copy in
            // one entry does not take a grant the other still has.
            const earlier = pending.get(value.legacyUuid);
            pending.set(
                value.legacyUuid,
                earlier === undefined
                    ? user
                    : {
                          name: user.name,
                          groups: mergeEntries(earlier.groups, user.groups, longerLived),
                          nodes: mergeEntries(earlier.nodes, user.nodes, longerLived),
                          meta: { ...earlier.meta, ...user.meta }
                      }
            );
        }
    }
    return { groups, users, pending };
};

/** Removes every `pending` entry keyed by this UUID, back to front so earlier indices hold. */
export const removePendingEntries = (document: ConfigDocument, legacyUuid: string): void => {
    const pending = document.get(['pending']);
    if (!Array.isArray(pending)) return;
    for (let index = pending.length - 1; index >= 0; index--) {
        const entry: unknown = pending[index];
        if (isRecord(entry) && entry.legacyUuid === legacyUuid) document.delete(['pending', index]);
    }
};

/** Compile-time proof that the written layout is the one the schema describes. */
({ schemaVersion: PERMISSIONS_SCHEMA_VERSION, groups: {}, users: {}, pending: [] }) satisfies PermissionsFile;
