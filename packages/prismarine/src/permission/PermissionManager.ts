import fs from 'node:fs';
import path from 'node:path';

import type { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

import Console from '../Console';
import type Server from '../Server';
import type { Service } from '../utils/Service';
import type { PlayerIdentity } from '../playerIdentity';
import type PlayerSession from '../network/PlayerSession';
import type { ConfigDocument } from '../config/ConfigDocument';
import type { OpEntry } from '../config/JsonConfigTypes';
import {
    readJsonFile,
    removeListEntries,
    toJsonFileContents,
    upsertListEntry,
    writeJsonFile
} from '../config/JsonFile';
import { subjectEntryOf, subjectOfEntry } from '../config/subjectEntry';
import type { Subject } from '../identity/Subject';
import { sameSubject, subjectId } from '../identity/Subject';
import { cwd, withCwd } from '../utils/cwd';
import { isRecord } from '../utils/isRecord';
import playerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import type { Group, Membership, Node, User } from './model';
import {
    BUILT_IN_GROUPS,
    checkExpiry,
    checkNode,
    DEFAULT_GROUP,
    EMPTY_GROUP,
    emptyUser,
    groupJson,
    isExpired,
    userJson
} from './model';
import type { FiledUser, LoadedPermissions } from './PermissionsFile';
import {
    defaultPermissionsDocument,
    groupPath,
    migrateLegacyPermissions,
    pendingIndexOf,
    PERMISSIONS_SCHEMA_VERSION,
    readPermissions,
    schemaVersionOf,
    userPath
} from './PermissionsFile';
import type { PermissionView } from './resolve';
import { commandLevelOf, directGroupsOf, hasPermission, metaOf, nodesOf, primaryGroupOf } from './resolve';

/** An operator entry: a name with a subject, or a name with the login UUID it was keyed by before subjects. */
const isOpEntry = (value: unknown): value is OpEntry =>
    isRecord(value) &&
    typeof value.name === 'string' &&
    (subjectOfEntry(value) !== undefined || typeof value.uuid === 'string');
/** Whether an entry waits for the login that claims its UUID. */
const isLegacyOpEntry = (value: unknown): value is OpEntry & { uuid: string } =>
    isOpEntry(value) && subjectOfEntry(value) === undefined && typeof value.uuid === 'string';

/**
 * The parts of the server the permission manager uses. A test can hand in these alone.
 */
export type PermissionManagerServer = Pick<Server, 'getLogger' | 'getSessionManager' | 'getKernel'>;

/** What a test may replace in the manager: the clock expiry reads, and whether the file is watched. */
export interface PermissionManagerOptions {
    /** Now, in milliseconds since the epoch. Defaults to `Date.now`. */
    readonly now?: () => number;
    /** Whether a change to `permissions.json` on disk reloads it. Defaults to true. */
    readonly watch?: boolean;
}

const PERMISSION_FILE_NAME = 'permissions.json';
const OPS_FILE_NAME = 'ops.json';
/** How long changes to the file may settle before it is read again, in milliseconds. */
const RELOAD_DEBOUNCE_MS = 150;

/**
 * Anything that can be checked for command permissions: the console, or a player-like object
 * that says whether it is an operator and whether it holds a node.
 */
export type PermissionSubject = Console | { isOp(): boolean; hasPermission(node: string): boolean };

/** Whose permissions to read: the identity a login carries, by its subject. */
export type PermissionHolder = Pick<PlayerIdentity, 'subject'>;

/** Whose record to write: the subject, and the name the record shows. */
export type NamedSubject = Pick<PlayerIdentity, 'subject' | 'name'>;

/** What a write touched, for whoever listens. A reload touches everything and names nothing. */
export interface PermissionChange {
    readonly subject?: Subject;
    readonly group?: string;
}

/**
 * Build a permission check for an executer. The console always passes, an operator always
 * passes, and otherwise the executer decides the node after resolution.
 *
 * @param executer - The console or player to check.
 * @returns An object whose `execute` method takes a permission string and reports whether the executer may run it. `not().execute` negates the result. A missing permission string always passes.
 * @throws Error when `execute` is called and the executer is undefined.
 */
export function canExecute(executer?: PermissionSubject) {
    const execute = (permission?: string) => {
        if (!executer) throw new PrismarineServerErrors.MissingExecutor();

        if (!permission) return true;
        if (executer instanceof Console) return true;
        if (executer.isOp()) return true;
        return executer.hasPermission(permission);
    };

    return {
        execute,
        not: () => {
            return {
                execute: (permission?: string) => !execute(permission)
            };
        }
    };
}

/** A group name: non-empty, without whitespace. @throws InvalidPermissionGroupName otherwise. */
const checkGroupName = (group: string): string => {
    if (group === '' || /\s/.test(group)) throw new PrismarineServerErrors.InvalidPermissionGroupName({ group });
    return group;
};

/**
 * Permission manager: the operators of `ops.json`, and the groups and users of `permissions.json`.
 */
export class PermissionManager implements Service {
    private readonly server: PermissionManagerServer;
    private readonly now: () => number;
    private readonly watching: boolean;
    /** The operators, by {@link subjectId}. */
    private readonly ops: Set<string> = new Set();
    /**
     * Operator entries written before subjects existed, by the login UUID each is keyed by. One
     * leaves when a login with its UUID claims it, which writes the entry under its subject.
     */
    private readonly pendingOps: Map<string, string> = new Map();
    private groups: Map<string, Group> = new Map();
    /** The users the file knows, by {@link subjectId}. */
    private users: Map<string, FiledUser> = new Map();
    /** Users migrated from a file keyed by login UUID, by that UUID, until a login claims each. */
    private pending: Map<string, User> = new Map();
    private readonly listeners = new Set<(change: PermissionChange) => void>();
    /** The last write of either file this manager queued; see {@link PermissionManager.queueWrite}. */
    private writes: Promise<unknown> = Promise.resolve();
    /** The text this manager last read from or wrote to `permissions.json`, so its own writes do not reload it. */
    private knownText = '';
    private watcher: fs.FSWatcher | undefined;
    private reloadTimer: NodeJS.Timeout | undefined;

    /**
     * Create a new permission manager.
     * @param server - The server instance.
     * @param options - The clock and the watch switch, for tests.
     */
    public constructor(server: PermissionManagerServer, options: PermissionManagerOptions = {}) {
        this.server = server;
        this.now = options.now ?? Date.now;
        this.watching = options.watch ?? true;
    }

    /**
     * Enable the manager and load all permissions.
     * @returns {Promise<void>} A promise that resolves when the manager is enabled.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        await this.parseOps();
        await this.loadPermissions();
        if (this.watching) this.watch();
    }

    /**
     * Signifies that the manager is being disabled and all permissions should be unloaded.
     * @returns {Promise<void>} A promise that resolves when the manager is disabled.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.watcher?.close();
        this.watcher = undefined;
        if (this.reloadTimer !== undefined) clearTimeout(this.reloadTimer);
        this.reloadTimer = undefined;
        // A change made just before the server stops still reaches the file.
        await this.writes;
        this.ops.clear();
        this.pendingOps.clear();
        this.groups = new Map();
        this.users = new Map();
        this.pending = new Map();
    }

    /**
     * Reads `ops.json` and `permissions.json` again, as `/reload` does, and tells the listeners.
     * A file that does not parse is logged and leaves what is in memory.
     */
    public async reload(): Promise<void> {
        await this.writes;
        try {
            this.ops.clear();
            this.pendingOps.clear();
            await this.parseOps();
            await this.loadPermissions();
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            return;
        }
        this.notify({});
    }

    /**
     * Hears of every write and reload. The listener gets the subject or group a write touched;
     * a reload names nothing.
     * @returns A function that stops listening.
     */
    public onChange(listener: (change: PermissionChange) => void): () => void {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    }

    private notify(change: PermissionChange): void {
        for (const listener of this.listeners) {
            try {
                listener(change);
            } catch (error: unknown) {
                this.server.getLogger().error(error);
            }
        }
    }

    // --- Reading --------------------------------------------------------------------------------

    /** What resolution reads of one subject. */
    private viewOf(subject: Subject): PermissionView {
        return {
            user: this.users.get(subjectId(subject))?.user,
            isOp: this.ops.has(subjectId(subject)),
            groupOf: (name) => this.groups.get(name),
            now: this.now()
        };
    }

    /** Whether a player holds a node after resolution. */
    public has(player: PermissionHolder, node: string): boolean {
        return hasPermission(this.viewOf(player.subject), node);
    }

    /** Every node that applies to a player, in resolution order. */
    public nodesOf(player: PermissionHolder): string[] {
        return nodesOf(this.viewOf(player.subject));
    }

    /** The resolved value of a meta key, or undefined when nothing sets it. */
    public metaOf(player: PermissionHolder, key: string): string | undefined {
        return metaOf(this.viewOf(player.subject), key);
    }

    /** The groups a player holds directly, heaviest first, `default` and an operator's `operator` included. */
    public groupsOf(player: PermissionHolder): string[] {
        return directGroupsOf(this.viewOf(player.subject));
    }

    /** The heaviest group a player holds directly. */
    public primaryGroupOf(player: PermissionHolder): string {
        return primaryGroupOf(this.viewOf(player.subject));
    }

    /** The command level a player runs at: the `level` meta, or 4 for an operator. */
    public commandLevelOf(player: PermissionHolder): CommandPermissionLevel {
        return commandLevelOf(this.viewOf(player.subject));
    }

    /** The user record of a subject, or undefined when the file has none. */
    public userOf(subject: Subject): User | undefined {
        return this.users.get(subjectId(subject))?.user;
    }

    /** The subjects whose records carry this name, for a command that names a player who is offline. */
    public subjectsNamed(name: string): Subject[] {
        return [...this.users.values()].filter(({ user }) => user.name === name).map(({ subject }) => subject);
    }

    /** A group by name, or undefined when the file has none. */
    public groupOf(name: string): Group | undefined {
        return this.groups.get(name);
    }

    /** Every group's name, as the file lists them. */
    public groupNames(): string[] {
        return [...this.groups.keys()];
    }

    // --- Writing --------------------------------------------------------------------------------

    /**
     * Queues an edit of `permissions.json` behind the writes queued before it, so two edits never
     * read and rewrite the file at once, and remembers the text written so the watcher leaves it
     * alone. Memory changed before the call; a failed write is logged and rethrown.
     */
    private queueWrite(edit: (document: ConfigDocument) => void, change: PermissionChange): Promise<void> {
        const file = withCwd(PERMISSION_FILE_NAME);
        const written = this.writes.then(async () => {
            const document = await readJsonFile(file, '{}');
            edit(document);
            this.knownText = toJsonFileContents(file, document);
            await writeJsonFile(file, document);
        });
        this.writes = written.catch((error: unknown) => {
            this.server.getLogger().error(`Failed to write ${PERMISSION_FILE_NAME}: ${error}`);
        });
        this.notify(change);
        return written;
    }

    /** Replaces a user's record in memory and in the file, or removes it when `user` is undefined. */
    private writeUser(subject: Subject, user: User | undefined): Promise<void> {
        const id = subjectId(subject);
        if (user === undefined) this.users.delete(id);
        else this.users.set(id, { subject, user });
        const now = this.now();
        return this.queueWrite(
            (document) => {
                if (user === undefined) document.delete(userPath(subject));
                else document.set(userPath(subject), userJson(user, now));
            },
            { subject }
        );
    }

    /** Replaces a group in memory and in the file, or removes it when `group` is undefined. */
    private writeGroup(name: string, group: Group | undefined): Promise<void> {
        if (group === undefined) this.groups.delete(name);
        else this.groups.set(name, group);
        const now = this.now();
        return this.queueWrite(
            (document) => {
                if (group === undefined) document.delete(groupPath(name));
                else document.set(groupPath(name), groupJson(group, now));
            },
            { group: name }
        );
    }

    /** The user a write starts from: the record, or an empty one under the player's name. */
    private userToEdit({ subject, name }: NamedSubject): User {
        const user = this.userOf(subject) ?? emptyUser(name);
        return { ...user, name };
    }

    /** The group a write starts from. @throws PermissionGroupNotFound when there is none. */
    private groupToEdit(name: string): Group {
        const group = this.groups.get(name);
        if (group === undefined) throw new PrismarineServerErrors.PermissionGroupNotFound({ group: name });
        return group;
    }

    /** The nodes with `node` set, replacing an earlier entry of the same spelling. */
    private withNode(nodes: readonly Node[], node: string, expires: string | undefined): Node[] {
        const added: Node =
            expires === undefined
                ? { node: checkNode(node) }
                : { node: checkNode(node), expires: checkExpiry(expires, this.now()) };
        return [...nodes.filter((entry) => entry.node !== node && !isExpired(entry, this.now())), added];
    }

    /** Gives a player a node of their own. */
    public async grantUser(player: NamedSubject, node: string, expires?: string): Promise<void> {
        const user = this.userToEdit(player);
        return this.writeUser(player.subject, { ...user, nodes: this.withNode(user.nodes, node, expires) });
    }

    /** Takes a player's own node away. @returns Whether the player had it. */
    public async revokeUser(player: NamedSubject, node: string): Promise<boolean> {
        const user = this.userToEdit(player);
        const nodes = user.nodes.filter((entry) => entry.node !== node);
        if (nodes.length === user.nodes.length) return false;
        await this.writeUser(player.subject, { ...user, nodes });
        return true;
    }

    /** Adds a player to a group. @throws PermissionGroupNotFound when the group does not exist. */
    public async addToGroup(player: NamedSubject, group: string, expires?: string): Promise<void> {
        this.groupToEdit(group);
        const user = this.userToEdit(player);
        const membership: Membership =
            expires === undefined ? { group } : { group, expires: checkExpiry(expires, this.now()) };
        const groups = [
            ...user.groups.filter((entry) => entry.group !== group && !isExpired(entry, this.now())),
            membership
        ];
        return this.writeUser(player.subject, { ...user, groups });
    }

    /** Removes a player from a group. @returns Whether the player was in it. */
    public async removeFromGroup(player: NamedSubject, group: string): Promise<boolean> {
        const user = this.userToEdit(player);
        const groups = user.groups.filter((entry) => entry.group !== group);
        if (groups.length === user.groups.length) return false;
        await this.writeUser(player.subject, { ...user, groups });
        return true;
    }

    /** Sets a player's own meta value, or removes the key when `value` is undefined. */
    public async setUserMeta(player: NamedSubject, key: string, value: string | undefined): Promise<void> {
        const user = this.userToEdit(player);
        const meta = { ...user.meta };
        if (value === undefined) delete meta[key];
        else meta[key] = value;
        return this.writeUser(player.subject, { ...user, meta });
    }

    /** Creates an empty group at weight 0. @throws PermissionGroupExists when the name is taken. */
    public async createGroup(name: string): Promise<void> {
        checkGroupName(name);
        if (this.groups.has(name)) throw new PrismarineServerErrors.PermissionGroupExists({ group: name });
        return this.writeGroup(name, EMPTY_GROUP);
    }

    /**
     * Deletes a group. Memberships and parent links that name it stay in the file and resolve to
     * nothing, as the file always has.
     * @throws PermissionGroupBuiltIn for `default` and `operator`, PermissionGroupNotFound otherwise.
     */
    public async deleteGroup(name: string): Promise<void> {
        if (BUILT_IN_GROUPS.includes(name)) throw new PrismarineServerErrors.PermissionGroupBuiltIn({ group: name });
        this.groupToEdit(name);
        return this.writeGroup(name, undefined);
    }

    /** Gives a group a node. */
    public async grantGroup(name: string, node: string, expires?: string): Promise<void> {
        const group = this.groupToEdit(name);
        return this.writeGroup(name, { ...group, nodes: this.withNode(group.nodes, node, expires) });
    }

    /** Takes a group's node away. @returns Whether the group had it. */
    public async revokeGroup(name: string, node: string): Promise<boolean> {
        const group = this.groupToEdit(name);
        const nodes = group.nodes.filter((entry) => entry.node !== node);
        if (nodes.length === group.nodes.length) return false;
        await this.writeGroup(name, { ...group, nodes });
        return true;
    }

    /** Makes `parent` a parent of a group. Both must exist, and a group cannot be its own parent. */
    public async addParent(name: string, parent: string): Promise<void> {
        if (name === parent) throw new PrismarineServerErrors.PermissionGroupOwnParent({ group: name });
        const group = this.groupToEdit(name);
        this.groupToEdit(parent);
        if (group.parents.includes(parent)) return;
        return this.writeGroup(name, { ...group, parents: [...group.parents, parent] });
    }

    /** Removes a parent from a group. @returns Whether it was a parent. */
    public async removeParent(name: string, parent: string): Promise<boolean> {
        const group = this.groupToEdit(name);
        if (!group.parents.includes(parent)) return false;
        await this.writeGroup(name, { ...group, parents: group.parents.filter((entry) => entry !== parent) });
        return true;
    }

    /** Sets a group's weight. */
    public async setGroupWeight(name: string, weight: number): Promise<void> {
        const group = this.groupToEdit(name);
        return this.writeGroup(name, { ...group, weight });
    }

    /** Sets a group's meta value, or removes the key when `value` is undefined. */
    public async setGroupMeta(name: string, key: string, value: string | undefined): Promise<void> {
        const group = this.groupToEdit(name);
        const meta = { ...group.meta };
        if (value === undefined) delete meta[key];
        else meta[key] = value;
        return this.writeGroup(name, { ...group, meta });
    }

    // --- The file -------------------------------------------------------------------------------

    /**
     * Reads `permissions.json`, writing a fresh one when there is none and migrating one written
     * before `schemaVersion` existed, with the old file kept beside it as `permissions.json.bak`.
     */
    private async loadPermissions(): Promise<void> {
        const file = withCwd(PERMISSION_FILE_NAME);
        let root: unknown;
        try {
            if (!fs.existsSync(file)) {
                // A first start has no file yet; making one is routine, not a warning.
                this.server.getLogger().info(`Created the default permissions in ${PERMISSION_FILE_NAME}.`);
                await writeJsonFile(file, defaultPermissionsDocument());
            }

            let document = await readJsonFile(file, '{}');
            root = document.get([]);
            if (!isRecord(root))
                throw new PrismarineServerErrors.PermissionsNotObject({ permissionFileName: PERMISSION_FILE_NAME });

            const version = schemaVersionOf(root);
            if (version === undefined) {
                await fs.promises.copyFile(file, `${file}.bak`);
                document = migrateLegacyPermissions(root);
                await writeJsonFile(file, document);
                root = document.get([]);
                this.server
                    .getLogger()
                    .info(
                        `Migrated ${PERMISSION_FILE_NAME} to schema version ${PERMISSIONS_SCHEMA_VERSION}; the old file is ${PERMISSION_FILE_NAME}.bak.`
                    );
            } else if (version > PERMISSIONS_SCHEMA_VERSION) {
                throw new PrismarineServerErrors.PermissionsSchemaUnsupported({
                    permissionFileName: PERMISSION_FILE_NAME,
                    schemaVersion: version,
                    supported: PERMISSIONS_SCHEMA_VERSION
                });
            }
            if (!isRecord(root))
                throw new PrismarineServerErrors.PermissionsNotObject({ permissionFileName: PERMISSION_FILE_NAME });
            this.knownText = toJsonFileContents(file, document);
            this.apply(readPermissions(root));
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new PrismarineServerErrors.InvalidPermissionsEntry({ permissionFileName: PERMISSION_FILE_NAME });
        }
    }

    /** Takes a loaded file as the state in memory, and logs each user still waiting for a login. */
    private apply(loaded: LoadedPermissions): void {
        this.groups = loaded.groups;
        this.users = loaded.users;
        this.pending = loaded.pending;
        if (!this.groups.has(DEFAULT_GROUP)) this.groups.set(DEFAULT_GROUP, EMPTY_GROUP);
        for (const [uuid, user] of this.pending) {
            // Once, so an owner sees who is waiting; see the plan's risks.
            this.server
                .getLogger()
                .info(
                    `${user.name} in ${PERMISSION_FILE_NAME} is keyed by the login UUID ${uuid} and gets their permissions back at their next login.`
                );
        }
    }

    /** Reloads the file when something other than this manager changes it. */
    private watch(): void {
        const directory = cwd();
        try {
            this.watcher = fs.watch(directory, (_event, filename) => {
                if (filename !== null && path.basename(filename) !== PERMISSION_FILE_NAME) return;
                if (this.reloadTimer !== undefined) clearTimeout(this.reloadTimer);
                this.reloadTimer = setTimeout(() => {
                    this.reloadTimer = undefined;
                    void this.reloadIfChanged();
                }, RELOAD_DEBOUNCE_MS);
                this.reloadTimer.unref();
            });
            this.watcher.unref();
            this.watcher.on('error', (error) => this.server.getLogger().error(error));
        } catch (error: unknown) {
            this.server.getLogger().warn(`Changes to ${PERMISSION_FILE_NAME} will not be reloaded: ${error}`);
        }
    }

    /** Reloads the file unless its text is what this manager last read or wrote. */
    private async reloadIfChanged(): Promise<void> {
        let text: string;
        try {
            text = await fs.promises.readFile(withCwd(PERMISSION_FILE_NAME), 'utf8');
        } catch {
            return;
        }
        if (text === this.knownText) return;
        this.server.getLogger().info(`${PERMISSION_FILE_NAME} changed on disk; reloading it.`);
        await this.reload();
    }

    // --- Operators ------------------------------------------------------------------------------

    private async parseOps(): Promise<void> {
        const file = withCwd(OPS_FILE_NAME);
        try {
            if (!fs.existsSync(file)) {
                this.server.getLogger().info(`Created an empty operator list in ${OPS_FILE_NAME}.`);
                await writeJsonFile(file, await readJsonFile(file, '[]'));
            }

            const ops = (await readJsonFile(file, '[]')).get([]);
            if (!Array.isArray(ops)) throw new PrismarineServerErrors.OpsNotList({ opsFileName: OPS_FILE_NAME });
            for (const op of ops) {
                if (!isOpEntry(op)) continue;
                const subject = subjectOfEntry(op);
                if (subject !== undefined) {
                    this.ops.add(subjectId(subject));
                } else if (isLegacyOpEntry(op)) {
                    this.pendingOps.set(op.uuid, op.name);
                    // Once, so an owner sees who is waiting; see the plan's risks.
                    this.server
                        .getLogger()
                        .info(
                            `Operator ${op.name} is keyed by the login UUID ${op.uuid} and becomes an operator again at their next login.`
                        );
                }
            }
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new PrismarineServerErrors.InvalidPermissionsEntry({ permissionFileName: OPS_FILE_NAME });
        }
    }

    /** Whether an entry is this subject's. */
    private static entryOf(subject: Subject) {
        return (entry: unknown): boolean => {
            const own = subjectOfEntry(entry);
            return own !== undefined && sameSubject(own, subject);
        };
    }

    /**
     * Adds or removes one player's line in `ops.json`, leaving the other lines and any comments
     * as they are.
     *
     * @param legacyUuid - The login UUID of the entry this one replaces, when a login claims an
     *   entry written before subjects existed.
     */
    private async writeOp(subject: Subject, username: string, op: boolean, legacyUuid?: string): Promise<void> {
        const file = withCwd(OPS_FILE_NAME);
        const document = await readJsonFile(file, '[]');
        const samePlayer = PermissionManager.entryOf(subject);
        const entry = { name: username, ...subjectEntryOf(subject), level: 4 };

        if (!op) {
            removeListEntries(document, samePlayer);
        } else if (legacyUuid === undefined) {
            upsertListEntry(document, samePlayer, entry);
        } else {
            // The claimed entry takes the subject where it is, so a comment beside it stays. A
            // line the player already had under the subject goes, so one player has one line.
            removeListEntries(document, samePlayer);
            upsertListEntry(
                document,
                (candidate) => isLegacyOpEntry(candidate) && candidate.uuid === legacyUuid,
                entry
            );
        }

        await writeJsonFile(file, document);
    }

    /**
     * Gives the entries a login UUID keyed before subjects existed their subject, when this login
     * carries that UUID: the operator entry of `ops.json`, and the user under `pending` in
     * `permissions.json`. The player holds both from here on, and each file is written behind the
     * writes queued before it.
     *
     * @param identity - Who logged in.
     * @returns Whether an entry was claimed.
     */
    public claimLegacy(identity: PlayerIdentity): boolean {
        let claimed = false;
        const name = this.pendingOps.get(identity.uuid);
        if (name !== undefined) {
            this.pendingOps.delete(identity.uuid);
            this.ops.add(subjectId(identity.subject));
            this.server
                .getLogger()
                .info(`Operator ${name} logged in as ${identity.name} and is now keyed by their account.`);
            void this.persistOp(identity.subject, identity.name, true, identity.uuid);
            claimed = true;
        }
        const waiting = this.pending.get(identity.uuid);
        if (waiting !== undefined) {
            this.pending.delete(identity.uuid);
            const existing = this.userOf(identity.subject);
            // A record the subject already has keeps what it has; the claimed one adds to it.
            const user: User = {
                name: identity.name,
                groups: [...(existing?.groups ?? []), ...waiting.groups],
                nodes: [...(existing?.nodes ?? []), ...waiting.nodes],
                meta: { ...waiting.meta, ...existing?.meta }
            };
            this.users.set(subjectId(identity.subject), { subject: identity.subject, user });
            const now = this.now();
            this.server
                .getLogger()
                .info(
                    `${waiting.name} in ${PERMISSION_FILE_NAME} logged in as ${identity.name} and is now keyed by their account.`
                );
            void this.queueWrite(
                (document) => {
                    const index = pendingIndexOf(document, identity.uuid);
                    if (index >= 0) document.delete(['pending', index]);
                    document.set(userPath(identity.subject), userJson(user, now));
                },
                { subject: identity.subject }
            ).catch(() => {});
            claimed = true;
        }
        return claimed;
    }

    /**
     * Runs the `playerToggleOperator` event and, unless a listener cancels it, changes the
     * operator list in memory.
     *
     * @returns Whether the list changed.
     */
    private toggleOp(target: PlayerSession, op: boolean): boolean {
        const event = new playerToggleOperatorEvent(target, op);
        this.server.getKernel().events.post('playerToggleOperator', event);
        if (event.isCanceled()) return false;

        const id = subjectId(target.identity.subject);
        if (op) this.ops.add(id);
        else this.ops.delete(id);
        this.notify({ subject: target.identity.subject });
        return true;
    }

    /**
     * Queues one player's line of `ops.json` behind the writes queued before it, so two changes
     * never read and rewrite the file at the same time.
     *
     * @returns Whether the file was written. A failed write is logged, not thrown.
     */
    private persistOp(subject: Subject, username: string, op: boolean, legacyUuid?: string): Promise<boolean> {
        const written = this.writes.then(async () => {
            await this.writeOp(subject, username, op, legacyUuid);
            return true;
        });
        const settled = written.catch((error: unknown) => {
            this.server.getLogger().error(`Failed to write ${OPS_FILE_NAME} for ${username}: ${error}`);
            return false;
        });
        this.writes = settled;
        return settled;
    }

    /**
     * Makes an online player an operator, or stops them being one, without waiting for anything
     * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
     *
     * The `playerToggleOperator` event runs and the list in memory changes before this returns,
     * so an input-lane handler can call it. `ops.json` is written afterwards, off the tick,
     * behind any write queued before it. A failed write is logged, and the change in memory
     * stays.
     *
     * @param target - The player's session.
     * @param op - Whether the player should be an operator.
     * @returns The sends that tell the player's client its new commands and abilities, already
     *   started, or `undefined` when a listener canceled the change.
     */
    public setOpNow(target: PlayerSession, op: boolean): Promise<void> | undefined {
        if (!this.toggleOp(target, op)) return undefined;
        void this.persistOp(target.identity.subject, target.identity.name, op);
        return (async () => {
            // After the change, because the list holds only the commands the player may now run.
            await target.sendAvailableCommands();
            await target.announceSettings();
        })();
    }

    /**
     * Set a player as an operator.
     *
     * @param {string} username - The player to set as an operator.
     * @param {boolean} op - Whether the player should be an operator.
     * @returns {Promise<boolean>} A promise that resolves with a boolean indicating whether the operation was successful.
     */
    public async setOp(username: string, op: boolean): Promise<boolean> {
        const target = this.server.getSessionManager().findSession({ name: username }); // TODO: by name not exact
        if (!target) throw new PrismarineServerErrors.PlayerNotFound({ username });
        if (!this.toggleOp(target, op)) return false;

        try {
            // Saved before the client is told anything, so a send that fails cannot leave the
            // change in memory alone, to be undone by the next restart.
            if (!(await this.persistOp(target.identity.subject, username, op))) return false;

            // After the change, so the list the client gets is the one its new status allows.
            await target.sendAvailableCommands();
            await target.announceSettings();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a player is an operator.
     *
     * @param subject - Who the player is to the permission files.
     * @returns Whether the player is an operator.
     */
    public isOp(subject: Subject): boolean {
        return this.ops.has(subjectId(subject));
    }

    /**
     * Check if a player can execute a command.
     *
     * @param executer - The player or console to check.
     * @returns An object with an execute method that takes a permission string and returns whether the executer can execute the command.
     */
    public can(executer?: PermissionSubject) {
        return canExecute(executer);
    }
}
