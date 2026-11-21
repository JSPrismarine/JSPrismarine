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
import { parseConfigDocument } from '../config/ConfigDocument';
import type { OpEntry } from '../config/JsonConfigTypes';
import { migrateFile } from '../config/FileMigrations';
import { readJsonFile, removeListEntries, upsertListEntry, writeJsonFile } from '../config/JsonFile';
import { subjectEntryOf, subjectOfEntry } from '../config/subjectEntry';
import type { Subject } from '../identity/Subject';
import { sameSubject, subjectId } from '../identity/Subject';
import { cwd, withCwd } from '../utils/cwd';
import { hasErrorCode } from '../utils/hasErrorCode';
import { isRecord } from '../utils/isRecord';
import playerToggleOperatorEvent from '../events/player/PlayerToggleOperatorEvent';
import type { Entry, Group, Membership, Node, User } from './model';
import {
    BUILT_IN_GROUPS,
    checkExpiry,
    checkNode,
    DEFAULT_GROUP,
    EMPTY_GROUP,
    emptyUser,
    groupJson,
    isExpired,
    mergeEntries,
    nextExpiryOf,
    OPERATOR_GROUP,
    userJson,
    withMeta
} from './model';
import type { FiledUser, LoadedPermissions } from './PermissionsFile';
import {
    builtInGroup,
    defaultPermissionsDocument,
    documentOf,
    dropParentCycles,
    groupPath,
    isCurrentLayout,
    PERMISSIONS_FILE_NAME,
    PERMISSIONS_MIGRATIONS,
    PERMISSIONS_SCHEMA_VERSION,
    readPermissions,
    removePendingEntries,
    userPath
} from './PermissionsFile';
import type { PermissionView } from './resolve';
import { commandLevelOf, directGroupsOf, hasPermission, metaOf, nodesOf, primaryGroupOf, wouldCycle } from './resolve';

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

const PERMISSION_FILE_NAME = PERMISSIONS_FILE_NAME;
const OPS_FILE_NAME = 'ops.json';
/** How long changes to the file may settle before it is read again, in milliseconds. */
const RELOAD_DEBOUNCE_MS = 150;
/** The longest wait a timer takes; an expiry further off waits this long and looks again. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Anything that can be checked for command permissions: the console, or a player-like object
 * that says whether it holds a node after resolution, operator status included.
 */
export type PermissionSubject = Console | { hasPermission(node: string): boolean };

/** Whose permissions to read: the identity a login carries, by its subject. */
export type PermissionHolder = Pick<PlayerIdentity, 'subject'>;

/** Whose record to write: the subject, and the name the record shows. */
export type NamedSubject = Pick<PlayerIdentity, 'subject' | 'name'>;

/**
 * What a write touched, for whoever listens: the user by subject and the name their record
 * shows, or the group. A reload touches everything and names nothing.
 */
export interface PermissionChange {
    readonly subject?: Subject;
    readonly name?: string;
    readonly group?: string;
}

/** The operators `ops.json` holds: by {@link subjectId}, and the legacy entries by login UUID. */
interface LoadedOps {
    readonly ops: Set<string>;
    readonly pendingOps: Map<string, string>;
}

/**
 * Build a permission check for an executer. The console always passes; otherwise the executer
 * decides the node after resolution, which grants an operator everything the `operator` group
 * holds unless a node of their own or a heavier group takes it away.
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

/** The nodes with `node` set, replacing an earlier entry of the same spelling and dropping expired ones. */
const withNode = (nodes: readonly Node[], added: Node, now: number): Node[] => [
    ...nodes.filter((entry) => entry.node !== added.node && !isExpired(entry, now)),
    added
];

/** Of two entries of one spelling, the one the subject already holds. */
const keepExisting = <T extends Entry>(existing: T): T => existing;

/** What memory-first changes a load is to keep: see {@link PermissionManager.sinceQueued}. */
interface SinceQueued {
    /** Operator changes by {@link subjectId}. */
    readonly ops: Map<string, boolean>;
    /** The legacy operator entries logins claimed, by the UUID claimed. */
    readonly claimedOps: Set<string>;
}

/** What a load answers: whether memory now holds the files, and the text `permissions.json` held. */
interface Loaded {
    readonly published: boolean;
    readonly text: string;
}

/**
 * Permission manager: the operators of `ops.json`, and the groups and users of `permissions.json`.
 *
 * Every edit of `permissions.json` and every reload runs on one queue, in order: an edit reads the
 * file, changes one record, writes, and only then changes memory and tells the listeners, so a
 * failed write leaves memory as the file is and the edit can be made again. Operator changes and
 * the claims a login makes stay memory-first, since a handler applies them in its input step.
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
    /** Users migrated from a file keyed by login UUID, by that UUID, until a login's claim is written. */
    private pending: Map<string, User> = new Map();
    /** The UUIDs whose claim is being written, so a second login meanwhile does not queue another. */
    private readonly claiming = new Set<string>();
    /**
     * The logins that merged a pending entry into their record and have not written it away yet,
     * by the UUID claimed. A write of the user's record takes the entry with it, so a revocation
     * made meanwhile is not undone by the claim's retry, and a load merges the entry again while
     * it waits, so a reload does not take the provisional record away.
     */
    private readonly pendingClaims = new Map<string, PlayerIdentity>();
    private readonly listeners = new Set<(change: PermissionChange) => void>();
    /** The queue every edit and reload of `permissions.json` and every write of `ops.json` runs on. */
    private writes: Promise<unknown> = Promise.resolve();
    /** The text this manager last read from or wrote to `permissions.json`, so its own writes do not reload it. */
    private knownText = '';
    private watcher: fs.FSWatcher | undefined;
    private reloadTimer: NodeJS.Timeout | undefined;
    /** Set by {@link PermissionManager.disable}, so a reload that was in flight publishes nothing. */
    private disabled = false;
    /**
     * What changed memory-first while a task was queued or running: operator changes, and the
     * legacy operator entries logins claimed. A reload, or an edit that finds the file changed,
     * reads the files behind whatever is queued, so the loaded state would undo these when
     * published; they are applied over it instead, and their writes are queued behind the load.
     * Absent while nothing is queued.
     */
    private sinceQueued: SinceQueued | undefined;
    /** How many tasks are queued or running, so the record above lives while any is. */
    private queued = 0;
    /** Wakes at the next expiry in memory, to send the clients what applies from then on. */
    private expiryTimer: NodeJS.Timeout | undefined;

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
        this.disabled = false;
        await this.load(true);
        if (this.watching) this.watch();
    }

    /**
     * Signifies that the manager is being disabled and all permissions should be unloaded.
     * @returns {Promise<void>} A promise that resolves when the manager is disabled.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        this.disabled = true;
        this.watcher?.close();
        this.watcher = undefined;
        if (this.reloadTimer !== undefined) clearTimeout(this.reloadTimer);
        this.reloadTimer = undefined;
        if (this.expiryTimer !== undefined) clearTimeout(this.expiryTimer);
        this.expiryTimer = undefined;
        // A change made just before the server stops still reaches the file, and a reload in
        // flight finishes without publishing.
        await this.writes;
        this.ops.clear();
        this.pendingOps.clear();
        this.groups = new Map();
        this.users = new Map();
        this.pending = new Map();
        this.claiming.clear();
        this.pendingClaims.clear();
    }

    /**
     * Reads `ops.json` and `permissions.json` again, as `/reload` does, behind the edits queued
     * before it. Memory changes only once both files read, and stays as it was when one does not
     * parse, which is logged and rejects so the command reports it. Afterwards the listeners hear
     * of it and every connected client gets its command list and abilities again; a reload that
     * shutdown overtook publishes nothing and tells nobody.
     * @throws InvalidPermissionsEntry when a file does not parse.
     */
    public reload(): Promise<void> {
        return this.queue(async () => {
            if (!(await this.load(false)).published) return;
            this.notify({});
            await this.refreshClients({});
        });
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

    /**
     * Sends the connected players a change may have reached their command list and abilities
     * again: the one player a user write names, or everyone after a group write or a reload. A send
     * that fails is logged; the client learns at its next join.
     */
    private async refreshClients(change: PermissionChange): Promise<void> {
        const sessions = this.server
            .getSessionManager()
            .getSessions()
            .filter(({ identity }) => change.subject === undefined || sameSubject(identity.subject, change.subject));
        await Promise.all(
            sessions.map(async (session) => {
                try {
                    await session.sendAvailableCommands();
                    await session.announceSettings();
                } catch (error: unknown) {
                    this.server.getLogger().error(error);
                }
            })
        );
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

    /** Runs a task behind everything queued before it, and keeps the queue going when it fails. */
    private queue<T>(task: () => Promise<T>): Promise<T> {
        // From here until the task has run, an operator change or a claim is kept to be applied
        // over what a load in the task reads, since the files are read behind whatever is queued now.
        this.queued++;
        this.sinceQueued ??= { ops: new Map(), claimedOps: new Set() };
        const run = this.writes.then(task).finally(() => {
            if (--this.queued === 0) this.sinceQueued = undefined;
        });
        this.writes = run.catch(() => {});
        return run;
    }

    /**
     * Edits one record of `permissions.json` on the queue: reads the file, lets `mutate` change the
     * document, writes it, and only then lets `apply` change memory, tells the listeners and
     * refreshes the clients. A file that changed on disk since it was last read is loaded first,
     * as the watcher would, so the edit computes from what the file says rather than writing over
     * a change the watcher has not caught up with; a file this server cannot read refuses the edit
     * the way a reload would. A file that is gone or blank is written again from memory, so the
     * edit lands in a complete file. A failed write is logged and rethrown, and leaves memory as
     * the file is.
     *
     * @returns What `mutate` answered, or undefined when it answered undefined to say nothing changed.
     * @throws InvalidPermissionsEntry when the file changed on disk into one that does not read,
     *   PermissionsFileNotLoaded when it is not a version 2 file once read.
     */
    private edit<T>(
        change: PermissionChange,
        mutate: (document: ConfigDocument) => { readonly apply: () => void; readonly result: T } | undefined
    ): Promise<T | undefined> {
        return this.queue(async () => {
            const file = withCwd(PERMISSION_FILE_NAME);
            const document = await this.documentToEdit(file);
            const outcome = mutate(document);
            if (outcome === undefined) return undefined;
            try {
                this.knownText = await writeJsonFile(file, document);
            } catch (error: unknown) {
                this.server.getLogger().error(`Failed to write ${PERMISSION_FILE_NAME}: ${error}`);
                throw error;
            }
            outcome.apply();
            this.scheduleExpiryRefresh();
            this.notify(change);
            await this.refreshClients(change);
            return outcome.result;
        });
    }

    /** The document an edit changes: the file as it is on disk, read into memory first when it changed there. */
    private async documentToEdit(file: string): Promise<ConfigDocument> {
        let text: string;
        try {
            text = await fs.promises.readFile(file, 'utf8');
        } catch (error: unknown) {
            if (!hasErrorCode(error, 'ENOENT')) throw error;
            text = '';
        }
        if (text.trim() === '') {
            this.server.getLogger().warn(`${PERMISSION_FILE_NAME} is missing; writing it again from memory.`);
            return documentOf({ groups: this.groups, users: this.users, pending: this.pending }, this.now());
        }
        if (text !== this.knownText) {
            this.server.getLogger().info(`${PERMISSION_FILE_NAME} changed on disk; reading it before the edit.`);
            // The edit computes from the text the load published, not from a read of its own, so a
            // save between the two cannot leave memory behind the document written.
            const read = await this.load(false);
            text = read.text;
            if (read.published) {
                this.notify({});
                await this.refreshClients({});
            }
        }
        const document = parseConfigDocument(text);
        const root = document.get([]);
        if (!isRecord(root) || !isCurrentLayout(root)) {
            throw new PrismarineServerErrors.PermissionsFileNotLoaded({
                permissionFileName: PERMISSION_FILE_NAME,
                supported: PERMISSIONS_SCHEMA_VERSION
            });
        }
        return document;
    }

    /**
     * Edits a user's record: `compute` gets the record as it is when the edit runs, or an empty one,
     * and answers the next record, or undefined to change nothing.
     * @returns Whether anything changed.
     */
    private async editUser(player: NamedSubject, compute: (user: User) => User | undefined): Promise<boolean> {
        const { subject } = player;
        const changed = await this.edit({ subject, name: player.name }, (document) => {
            const current = { ...(this.userOf(subject) ?? emptyUser(player.name)), name: player.name };
            const next = compute(current);
            if (next === undefined) return undefined;
            // A pending entry this subject claimed and has not written away goes with the record,
            // so a revocation made here is not undone by the claim's retry importing it again.
            const claim = this.pendingClaimOf(subject);
            if (claim !== undefined) removePendingEntries(document, claim);
            document.set(userPath(subject), userJson(next, this.now()));
            return {
                result: true,
                apply: () => {
                    this.users.set(subjectId(subject), { subject, user: next });
                    if (claim !== undefined) this.settleClaim(claim);
                }
            };
        });
        return changed === true;
    }

    /**
     * Edits a group: `compute` gets the group as it is when the edit runs and answers the next
     * group, or undefined to change nothing.
     * @returns Whether anything changed.
     * @throws PermissionGroupNotFound when the group is gone by the time the edit runs.
     */
    private async editGroup(name: string, compute: (group: Group) => Group | undefined): Promise<boolean> {
        const changed = await this.edit({ group: name }, (document) => {
            const next = compute(this.groupToEdit(name));
            if (next === undefined) return undefined;
            document.set(groupPath(name), groupJson(next, this.now()));
            return { result: true, apply: () => void this.groups.set(name, next) };
        });
        return changed === true;
    }

    /** The UUID of the pending entry this subject claimed and has not written away, if any. */
    private pendingClaimOf(subject: Subject): string | undefined {
        for (const [uuid, identity] of this.pendingClaims) if (sameSubject(identity.subject, subject)) return uuid;
        return undefined;
    }

    /** Forgets a pending entry once a write has taken it out of the file. */
    private settleClaim(uuid: string): void {
        this.pending.delete(uuid);
        this.pendingClaims.delete(uuid);
    }

    /** The group a write starts from. @throws PermissionGroupNotFound when there is none. */
    private groupToEdit(name: string): Group {
        const group = this.groups.get(name);
        if (group === undefined) throw new PrismarineServerErrors.PermissionGroupNotFound({ group: name });
        return group;
    }

    /**
     * A node as a grant writes it. A grant checks it when asked for, so the caller hears of a bad
     * one before the edit queues, and again when the edit runs, so an expiry the queue outlived is
     * refused rather than written.
     */
    private nodeToAdd(node: string, expires: string | undefined): Node {
        return expires === undefined
            ? { node: checkNode(node) }
            : { node: checkNode(node), expires: checkExpiry(expires, this.now()) };
    }

    /** Gives a player a node of their own. */
    public async grantUser(player: NamedSubject, node: string, expires?: string): Promise<void> {
        this.nodeToAdd(node, expires);
        await this.editUser(player, (user) => ({
            ...user,
            nodes: withNode(user.nodes, this.nodeToAdd(node, expires), this.now())
        }));
    }

    /** Takes a player's own node away. @returns Whether the player had it. */
    public revokeUser(player: NamedSubject, node: string): Promise<boolean> {
        return this.editUser(player, (user) => {
            const nodes = user.nodes.filter((entry) => entry.node !== node);
            return nodes.length === user.nodes.length ? undefined : { ...user, nodes };
        });
    }

    /**
     * Adds a player to a group. The group and the expiry are checked when asked for and again when
     * the edit runs, since an edit queued before it may have deleted the group or outlived the expiry.
     * @throws PermissionGroupNotFound when the group does not exist.
     */
    public async addToGroup(player: NamedSubject, group: string, expires?: string): Promise<void> {
        const membershipToAdd = (): Membership => {
            this.groupToEdit(group);
            return expires === undefined ? { group } : { group, expires: checkExpiry(expires, this.now()) };
        };
        membershipToAdd();
        await this.editUser(player, (user) => ({
            ...user,
            groups: [
                ...user.groups.filter((entry) => entry.group !== group && !isExpired(entry, this.now())),
                membershipToAdd()
            ]
        }));
    }

    /** Removes a player from a group. @returns Whether the player was in it. */
    public removeFromGroup(player: NamedSubject, group: string): Promise<boolean> {
        return this.editUser(player, (user) => {
            const groups = user.groups.filter((entry) => entry.group !== group);
            return groups.length === user.groups.length ? undefined : { ...user, groups };
        });
    }

    /** Sets a player's own meta value, or removes the key when `value` is undefined. */
    public async setUserMeta(player: NamedSubject, key: string, value: string | undefined): Promise<void> {
        await this.editUser(player, (user) => ({ ...user, meta: withMeta(user.meta, key, value) }));
    }

    /** Creates an empty group at weight 0. @throws PermissionGroupExists when the name is taken. */
    public async createGroup(name: string): Promise<void> {
        checkGroupName(name);
        if (this.groups.has(name)) throw new PrismarineServerErrors.PermissionGroupExists({ group: name });
        await this.edit({ group: name }, (document) => {
            if (this.groups.has(name)) throw new PrismarineServerErrors.PermissionGroupExists({ group: name });
            document.set(groupPath(name), groupJson(EMPTY_GROUP, this.now()));
            return { result: true, apply: () => void this.groups.set(name, EMPTY_GROUP) };
        });
    }

    /**
     * Deletes a group. Memberships and parent links that name it stay in the file and resolve to
     * nothing, as the file always has.
     * @throws PermissionGroupBuiltIn for `default` and `operator`, PermissionGroupNotFound otherwise.
     */
    public async deleteGroup(name: string): Promise<void> {
        if (BUILT_IN_GROUPS.includes(name)) throw new PrismarineServerErrors.PermissionGroupBuiltIn({ group: name });
        this.groupToEdit(name);
        await this.edit({ group: name }, (document) => {
            this.groupToEdit(name);
            document.delete(groupPath(name));
            return { result: true, apply: () => void this.groups.delete(name) };
        });
    }

    /** Gives a group a node. */
    public async grantGroup(name: string, node: string, expires?: string): Promise<void> {
        this.groupToEdit(name);
        this.nodeToAdd(node, expires);
        await this.editGroup(name, (group) => ({
            ...group,
            nodes: withNode(group.nodes, this.nodeToAdd(node, expires), this.now())
        }));
    }

    /** Takes a group's node away. @returns Whether the group had it. */
    public revokeGroup(name: string, node: string): Promise<boolean> {
        this.groupToEdit(name);
        return this.editGroup(name, (group) => {
            const nodes = group.nodes.filter((entry) => entry.node !== node);
            return nodes.length === group.nodes.length ? undefined : { ...group, nodes };
        });
    }

    /**
     * Makes `parent` a parent of a group. Both must exist, and the parent may not inherit from the
     * group already, or the group would be its own ancestor.
     * @throws PermissionGroupCycle when it would be.
     */
    public async addParent(name: string, parent: string): Promise<void> {
        this.groupToEdit(name);
        this.groupToEdit(parent);
        if (wouldCycle(name, parent, (candidate) => this.groups.get(candidate))) {
            throw new PrismarineServerErrors.PermissionGroupCycle({ group: name, parent });
        }
        // Whether the link is there is decided when the edit runs, behind a removal queued before it.
        await this.editGroup(name, (current) => {
            this.groupToEdit(parent);
            if (wouldCycle(name, parent, (candidate) => this.groups.get(candidate))) {
                throw new PrismarineServerErrors.PermissionGroupCycle({ group: name, parent });
            }
            return current.parents.includes(parent) ? undefined : { ...current, parents: [...current.parents, parent] };
        });
    }

    /** Removes a parent from a group. @returns Whether it was a parent. */
    public removeParent(name: string, parent: string): Promise<boolean> {
        this.groupToEdit(name);
        return this.editGroup(name, (group) =>
            group.parents.includes(parent)
                ? { ...group, parents: group.parents.filter((entry) => entry !== parent) }
                : undefined
        );
    }

    /** Sets a group's weight. @throws InvalidPermissionGroupWeight for one the file cannot hold. */
    public async setGroupWeight(name: string, weight: number): Promise<void> {
        this.groupToEdit(name);
        if (!Number.isFinite(weight))
            throw new PrismarineServerErrors.InvalidPermissionGroupWeight({ weight: String(weight) });
        await this.editGroup(name, (group) => ({ ...group, weight }));
    }

    /** Sets a group's meta value, or removes the key when `value` is undefined. */
    public async setGroupMeta(name: string, key: string, value: string | undefined): Promise<void> {
        this.groupToEdit(name);
        await this.editGroup(name, (group) => ({ ...group, meta: withMeta(group.meta, key, value) }));
    }

    // --- The file -------------------------------------------------------------------------------

    /**
     * Reads both files and publishes them together, so a file that does not parse leaves memory as
     * it was. `announce` logs the entries still waiting for a login, which a start does once.
     * @returns Whether memory now holds the files, false when shutdown overtook the read, and the
     *   text `permissions.json` held, which an edit that caused the load computes from.
     * @throws InvalidPermissionsEntry when either file does not parse.
     */
    private async load(announce: boolean): Promise<Loaded> {
        const ops = await this.readOps();
        const { loaded: permissions, text } = await this.readPermissionsFile();
        if (this.disabled) return { published: false, text };
        this.ops.clear();
        for (const id of ops.ops) this.ops.add(id);
        // An operator made or unmade since the task was queued keeps that change; its write is
        // queued behind this load, so the file agrees once it runs.
        for (const [id, op] of this.sinceQueued?.ops ?? []) {
            if (op) this.ops.add(id);
            else this.ops.delete(id);
        }
        this.pendingOps.clear();
        for (const [uuid, name] of ops.pendingOps) this.pendingOps.set(uuid, name);
        // A legacy operator entry a login claimed since the task was queued stays claimed.
        for (const uuid of this.sinceQueued?.claimedOps ?? []) this.pendingOps.delete(uuid);
        this.groups = permissions.groups;
        this.users = permissions.users;
        this.pending = permissions.pending;
        // A login that merged a pending entry and has not written it away holds the merge again,
        // while the file still has the entry.
        for (const [uuid, identity] of this.pendingClaims) {
            const waiting = this.pending.get(uuid);
            if (waiting !== undefined) this.users.set(subjectId(identity.subject), this.claimed(identity, waiting));
        }
        // The bytes the file held, so a later read of the same bytes is not taken for a change.
        this.knownText = text;
        this.scheduleExpiryRefresh();
        if (!announce) return { published: true, text };
        for (const [uuid, name] of this.pendingOps) {
            // Once, so an owner sees who is waiting; see the plan's risks.
            this.server
                .getLogger()
                .info(
                    `Operator ${name} is keyed by the login UUID ${uuid} and becomes an operator again at their next login.`
                );
        }
        for (const [uuid, user] of this.pending) {
            this.server
                .getLogger()
                .info(
                    `${user.name} in ${PERMISSION_FILE_NAME} is keyed by the login UUID ${uuid} and gets their permissions back at their next login.`
                );
        }
        return { published: true, text };
    }

    /** Every node and membership in memory that could expire. */
    private *entries(): Generator<Entry> {
        for (const group of this.groups.values()) yield* group.nodes;
        for (const { user } of this.users.values()) {
            yield* user.nodes;
            yield* user.groups;
        }
    }

    /**
     * Wakes at the next expiry in memory. Resolution skips an entry from that instant, but nothing
     * else runs then, so the connected clients are sent their command list and abilities again as
     * an edit sends them; until then they would show what they were last sent.
     */
    private scheduleExpiryRefresh(): void {
        if (this.expiryTimer !== undefined) clearTimeout(this.expiryTimer);
        this.expiryTimer = undefined;
        if (this.disabled) return;
        const next = nextExpiryOf(this.entries(), this.now());
        if (next === undefined) return;
        this.expiryTimer = setTimeout(
            () => {
                this.expiryTimer = undefined;
                void this.refreshExpired(next);
            },
            Math.min(next - this.now(), MAX_TIMER_MS)
        );
        this.expiryTimer.unref();
    }

    /** Sends the clients what applies once `at` has passed, with the expiry after it already armed. */
    private async refreshExpired(at: number): Promise<void> {
        if (this.disabled) return;
        // A timer capped at the longest wait wakes before the instant; it looks again below. The
        // next deadline is armed before the sends, which can outlast it.
        const due = this.now() >= at;
        this.scheduleExpiryRefresh();
        if (due) await this.refreshClients({});
    }

    /**
     * Reads `permissions.json`, writing a fresh one when there is none and bringing an older one to
     * the current layout through {@link PERMISSIONS_MIGRATIONS}, which keeps the original beside it.
     * A file that lacks `default` or `operator` reads as if it had a fresh file's, and a parent that
     * would make a group its own ancestor is dropped with a log line.
     */
    private async readPermissionsFile(): Promise<{ readonly loaded: LoadedPermissions; readonly text: string }> {
        const file = withCwd(PERMISSION_FILE_NAME);
        try {
            let migrated = await migrateFile(file, PERMISSIONS_MIGRATIONS, this.server.getLogger());
            if (migrated === undefined) {
                // A first start has no file yet; making one is routine, not a warning.
                this.server.getLogger().info(`Created the default permissions in ${PERMISSION_FILE_NAME}.`);
                const document = defaultPermissionsDocument();
                const text = await writeJsonFile(file, document);
                migrated = { document, text, from: PERMISSIONS_SCHEMA_VERSION, to: PERMISSIONS_SCHEMA_VERSION };
            }
            const { document, text } = migrated;
            // The migration refuses a root that is not an object, so this only narrows the type.
            const root = document.get([]);
            const loaded = readPermissions(isRecord(root) ? root : {});
            for (const name of [DEFAULT_GROUP, OPERATOR_GROUP] as const) {
                if (!loaded.groups.has(name)) loaded.groups.set(name, builtInGroup(name));
            }
            for (const { group, parent } of dropParentCycles(loaded.groups)) {
                this.server
                    .getLogger()
                    .error(
                        new PrismarineServerErrors.PermissionGroupCycle({ group, parent }).message +
                            `; ${PERMISSION_FILE_NAME} names it, so the parent is ignored`
                    );
            }
            return { loaded, text };
        } catch (error: unknown) {
            this.server.getLogger().error(error);
            throw new PrismarineServerErrors.InvalidPermissionsEntry({ permissionFileName: PERMISSION_FILE_NAME });
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

    /** Reloads the file unless its text is what this manager last read or wrote. A failed reload is logged by the load. */
    private async reloadIfChanged(): Promise<void> {
        if (this.disabled) return;
        let text: string;
        try {
            text = await fs.promises.readFile(withCwd(PERMISSION_FILE_NAME), 'utf8');
        } catch {
            return;
        }
        if (text === this.knownText) return;
        this.server.getLogger().info(`${PERMISSION_FILE_NAME} changed on disk; reloading it.`);
        await this.reload().catch(() => {});
    }

    // --- Operators ------------------------------------------------------------------------------

    /** Reads `ops.json`, writing an empty one when there is none. @throws InvalidPermissionsEntry when it does not parse. */
    private async readOps(): Promise<LoadedOps> {
        const file = withCwd(OPS_FILE_NAME);
        const loaded: LoadedOps = { ops: new Set(), pendingOps: new Map() };
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
                if (subject !== undefined) loaded.ops.add(subjectId(subject));
                else if (isLegacyOpEntry(op)) loaded.pendingOps.set(op.uuid, op.name);
            }
            return loaded;
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
        const { uuid, subject } = identity;
        const name = this.pendingOps.get(uuid);
        if (name !== undefined) {
            this.pendingOps.delete(uuid);
            this.ops.add(subjectId(subject));
            this.sinceQueued?.ops.set(subjectId(subject), true);
            this.sinceQueued?.claimedOps.add(uuid);
            this.server
                .getLogger()
                .info(`Operator ${name} logged in as ${identity.name} and is now keyed by their account.`);
            void this.persistOp(subject, identity.name, true, uuid);
            claimed = true;
        }
        const waiting = this.pending.get(uuid);
        if (waiting !== undefined && !this.claiming.has(uuid)) {
            this.claiming.add(uuid);
            // The player has their permissions from this login on; the file follows, and the entry
            // stays under `pending` in memory and on disk until the write succeeds, so a failed
            // write is retried at their next login. The merge is made once: a login after a failed
            // write keeps the record as it stands, revocations made since included.
            if (!this.pendingClaims.has(uuid)) this.users.set(subjectId(subject), this.claimed(identity, waiting));
            this.pendingClaims.set(uuid, identity);
            this.server
                .getLogger()
                .info(
                    `${waiting.name} in ${PERMISSION_FILE_NAME} logged in as ${identity.name} and is now keyed by their account.`
                );
            this.edit({ subject, name: identity.name }, (document) => {
                removePendingEntries(document, uuid);
                // The record as memory holds it when the write runs: the merge made at login, which
                // a load keeps while the entry waits, with every edit queued before this one applied.
                const user = this.userOf(subject) ?? this.claimed(identity, waiting).user;
                const filed: FiledUser = { subject, user: { ...user, name: identity.name } };
                document.set(userPath(subject), userJson(filed.user, this.now()));
                return {
                    result: true,
                    apply: () => {
                        this.users.set(subjectId(subject), filed);
                        this.settleClaim(uuid);
                    }
                };
            })
                .catch(() => {})
                .finally(() => this.claiming.delete(uuid));
            claimed = true;
        }
        return claimed;
    }

    /**
     * The record a login holds once it claims a pending entry: what the subject already has, with
     * what waited added to it, each node and membership once and the existing one kept, so a
     * claim merged twice adds nothing the second time.
     */
    private claimed(identity: NamedSubject, waiting: User): FiledUser {
        const existing = this.userOf(identity.subject);
        return {
            subject: identity.subject,
            user: {
                name: identity.name,
                groups: mergeEntries(existing?.groups ?? [], waiting.groups, keepExisting),
                nodes: mergeEntries(existing?.nodes ?? [], waiting.nodes, keepExisting),
                meta: { ...waiting.meta, ...existing?.meta }
            }
        };
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
        this.sinceQueued?.ops.set(id, op);
        this.notify({ subject: target.identity.subject, name: target.identity.name });
        return true;
    }

    /**
     * Queues one player's line of `ops.json` behind the writes queued before it, so two changes
     * never read and rewrite the file at the same time.
     *
     * @returns Whether the file was written. A failed write is logged, not thrown.
     */
    private persistOp(subject: Subject, username: string, op: boolean, legacyUuid?: string): Promise<boolean> {
        return this.queue(async () => {
            await this.writeOp(subject, username, op, legacyUuid);
            return true;
        }).catch((error: unknown) => {
            this.server.getLogger().error(`Failed to write ${OPS_FILE_NAME} for ${username}: ${error}`);
            return false;
        });
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
