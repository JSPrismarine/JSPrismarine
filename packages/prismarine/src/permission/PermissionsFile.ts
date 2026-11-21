/**
 * `permissions.json` on disk: how the version 2 layout is read, how a file written before it
 * migrates, and the paths each write edits in place so comments survive
 * ([the permissions plan](../../../../docs/plans/permissions.md)).
 */
import type { ConfigDocument, ConfigPath } from '../config/ConfigDocument';
import { parseConfigDocument } from '../config/ConfigDocument';
import type { PermissionGroupJson, PermissionsFile } from '../config/JsonConfigTypes';
import type { Subject } from '../identity/Subject';
import { SUBJECT_KINDS, parseSubject, subjectId, subjectKey } from '../identity/Subject';
import { isRecord } from '../utils/isRecord';
import { isStringList } from '../utils/isStringList';
import type { Group, User } from './model';
import { DEFAULT_GROUP, EVERY_NODE, OPERATOR_GROUP, readGroup, readUser } from './model';

/** The layout this server reads and writes. */
export const PERMISSIONS_SCHEMA_VERSION = 2 as const;

/** The permissions a fresh `permissions.json` grants every player, as the `default` group's nodes. */
export const DEFAULT_PLAYER_PERMISSIONS: readonly string[] = [
    'minecraft.command.help',
    'minecraft.command.list',
    'minecraft.command.me',
    'jsprismarine.command.plugins',
    'jsprismarine.command.version',
    'jsprismarine.command.tps'
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

/** Writes the version 2 keys into an empty document, each explained. */
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

/** The `players` entries of a version 1 file that have a name, a UUID and a permission list. */
export const legacyPlayersOf = (root: Record<string, unknown>): LegacyPlayer[] =>
    Array.isArray(root.players)
        ? root.players.flatMap((player: unknown): LegacyPlayer[] =>
              isRecord(player) &&
              typeof player.name === 'string' &&
              typeof player.uuid === 'string' &&
              isStringList(player.permissions)
                  ? [{ name: player.name, uuid: player.uuid, permissions: player.permissions }]
                  : []
          )
        : [];

/**
 * The version 2 document a version 1 file becomes: `defaultPermissions` as the `default` group's
 * nodes, `defaultOperatorPermissions` as `operator`'s, and each `players` entry under `pending`
 * with its UUID as `legacyUuid`, until a login with that UUID claims it.
 */
export const migrateLegacyPermissions = (root: Record<string, unknown>): ConfigDocument => {
    const document = parseConfigDocument('{}');
    writeLayout(
        document,
        builtInGroups(
            isStringList(root.defaultPermissions) ? root.defaultPermissions : undefined,
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

/** The `schemaVersion` a file names, or undefined for a file without one. */
export const schemaVersionOf = (root: Record<string, unknown>): number | undefined =>
    typeof root.schemaVersion === 'number' ? root.schemaVersion : undefined;

/**
 * Reads a version 2 document into memory. A section or an entry that does not have the shape the
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
            if (user !== undefined && isRecord(value) && typeof value.legacyUuid === 'string') {
                pending.set(value.legacyUuid, user);
            }
        }
    }
    return { groups, users, pending };
};

/** The index of a pending entry in the file's `pending` list, or -1. */
export const pendingIndexOf = (document: ConfigDocument, legacyUuid: string): number => {
    const pending = document.get(['pending']);
    if (!Array.isArray(pending)) return -1;
    return pending.findIndex((entry: unknown) => isRecord(entry) && entry.legacyUuid === legacyUuid);
};

/** Compile-time proof that the written layout is the one the schema describes. */
({ schemaVersion: PERMISSIONS_SCHEMA_VERSION, groups: {}, users: {}, pending: [] }) satisfies PermissionsFile;
