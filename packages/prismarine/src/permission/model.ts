/**
 * The permission model `permissions.json` holds ([the permissions plan](../../../../docs/plans/permissions.md)):
 * groups with a weight, parents, nodes and meta, and users with memberships, nodes and meta of
 * their own. {@link resolve} walks it; the manager owns the file.
 */
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

import { isRecord } from '../utils/isRecord';
import { isStringList } from '../utils/isStringList';
import type {
    PermissionGroupJson,
    PermissionMembershipJson,
    PermissionNodeJson,
    PermissionUserJson
} from '../config/JsonConfigTypes';

/** The group every subject holds. */
export const DEFAULT_GROUP = 'default';
/** The group every operator holds. */
export const OPERATOR_GROUP = 'operator';
/** The groups the file always has, which cannot be deleted. */
export const BUILT_IN_GROUPS: readonly string[] = [DEFAULT_GROUP, OPERATOR_GROUP];

/** The node that grants everything, which the `operator` group holds. */
export const EVERY_NODE = '*';

/** The meta key that sets a subject's command level, from 0 to 4. */
export const LEVEL_META = 'level';

/**
 * One node a group or a user holds. `node` is `scope.name`, `scope.*` for a whole scope or `*`
 * for everything, and a leading `-` negates. A bare `scope.name` also covers `scope.name.*`, as
 * the checks always have.
 */
export interface Node {
    readonly node: string;
    /** When the node stops applying, as ISO 8601; absent for never. */
    readonly expires?: string;
}

/** A membership of a user in a group. */
export interface Membership {
    readonly group: string;
    /** When the membership ends, as ISO 8601; absent for never. */
    readonly expires?: string;
}

/** A group. */
export interface Group {
    /** A heavier group decides before a lighter one. */
    readonly weight: number;
    readonly parents: readonly string[];
    readonly nodes: readonly Node[];
    /** `prefix`, `suffix`, `level` or anything else a pack reads. */
    readonly meta: Readonly<Record<string, string>>;
}

/** A user: one subject's own memberships, nodes and meta. */
export interface User {
    /** The name last seen, for reading the file. The key decides who it is. */
    readonly name: string;
    readonly groups: readonly Membership[];
    readonly nodes: readonly Node[];
    readonly meta: Readonly<Record<string, string>>;
}

/** A group with nothing in it, at weight 0. */
export const EMPTY_GROUP: Group = Object.freeze({ weight: 0, parents: [], nodes: [], meta: {} });

/** A user of this name with nothing of their own. */
export const emptyUser = (name: string): User => ({ name, groups: [], nodes: [], meta: {} });

/**
 * An ISO 8601 instant with an explicit `Z` or offset, such as `2030-01-01T00:00:00Z`. A local
 * time without one would read differently on each host, so it is not an instant.
 */
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The milliseconds since the epoch an expiry names, or undefined when it is not an instant with a
 * time zone or names a date the calendar does not have.
 */
export const parseInstant = (text: string): number | undefined => {
    const match = INSTANT.exec(text);
    if (match === null) return undefined;
    const [, year, month, day, hour, minute, second = '0', zone = 'Z'] = match;
    const at = Date.parse(text);
    if (Number.isNaN(at)) return undefined;
    // `Date.parse` rolls an impossible date such as February 30 into March; the calendar fields
    // of the instant it answers have to be the ones written, read in the offset written.
    const offsetMinutes =
        zone === 'Z' ? 0 : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
    const local = new Date(at + offsetMinutes * 60_000);
    const same =
        local.getUTCFullYear() === Number(year) &&
        local.getUTCMonth() + 1 === Number(month) &&
        local.getUTCDate() === Number(day) &&
        local.getUTCHours() === Number(hour) &&
        local.getUTCMinutes() === Number(minute) &&
        local.getUTCSeconds() === Number(second);
    return same ? at : undefined;
};

/**
 * Whether something with an expiry has expired at `now`, in milliseconds since the epoch. An
 * expiry that is not an instant counts as expired, so a damaged entry grants nothing.
 */
export const isExpired = ({ expires }: { readonly expires?: string }, now: number): boolean => {
    if (expires === undefined) return false;
    const at = parseInstant(expires);
    return at === undefined || at <= now;
};

/**
 * Checks a node's spelling: non-empty segments separated by dots, `*` alone or as the last
 * segment, and at most one leading `-`.
 * @throws InvalidPermissionNode when the node is not spelled that way.
 */
export const checkNode = (node: string): string => {
    const name = node.startsWith('-') ? node.slice(1) : node;
    const segments = name.split('.');
    const wellFormed =
        name !== '' &&
        segments.every(
            (segment, index) => /^[^\s.*-][^\s.*]*$/.test(segment) || (segment === '*' && index === segments.length - 1)
        );
    if (!wellFormed) throw new PrismarineServerErrors.InvalidPermissionNode({ node });
    return node;
};

/**
 * Checks an expiry: an ISO 8601 instant with a time zone, in the future.
 * @throws InvalidPermissionExpiry when it is not one or is already past.
 */
export const checkExpiry = (expires: string, now: number): string => {
    const at = parseInstant(expires);
    if (at === undefined || at <= now) throw new PrismarineServerErrors.InvalidPermissionExpiry({ expires });
    return new Date(at).toISOString();
};

/** Whether a value is a map of string to string. */
const isMeta = (value: unknown): value is Record<string, string> =>
    isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');

/**
 * The expiry an entry of the file carries: a string, absent for never, or `null` for an entry whose
 * `expires` is something else, which is skipped rather than read as permanent.
 */
const readExpires = (value: Record<string, unknown>): string | undefined | null => {
    if (!('expires' in value) || value.expires === undefined) return undefined;
    return typeof value.expires === 'string' ? value.expires : null;
};

/** The node an entry of the file holds, or undefined for one that is not a node. */
const readNode = (value: unknown): Node | undefined => {
    if (!isRecord(value) || typeof value.node !== 'string') return undefined;
    const expires = readExpires(value);
    if (expires === null) return undefined;
    return expires === undefined ? { node: value.node } : { node: value.node, expires };
};

const readMembership = (value: unknown): Membership | undefined => {
    if (!isRecord(value) || typeof value.group !== 'string') return undefined;
    const expires = readExpires(value);
    if (expires === null) return undefined;
    return expires === undefined ? { group: value.group } : { group: value.group, expires };
};

/** The entries of a list that `read` accepts, or none for something that is not a list. */
const readList = <T>(value: unknown, read: (entry: unknown) => T | undefined): T[] =>
    Array.isArray(value) ? value.flatMap((entry) => read(entry) ?? []) : [];

/**
 * The group a value of the file holds. A field that is missing or malformed reads as empty, so
 * one bad line does not refuse the file.
 */
export const readGroup = (value: unknown): Group => {
    if (!isRecord(value)) return EMPTY_GROUP;
    return {
        weight: typeof value.weight === 'number' && Number.isFinite(value.weight) ? value.weight : 0,
        parents: isStringList(value.parents) ? value.parents : [],
        nodes: readList(value.nodes, readNode),
        meta: isMeta(value.meta) ? value.meta : {}
    };
};

/** The user a value of the file holds, or undefined for a value without a name. */
export const readUser = (value: unknown): User | undefined => {
    if (!isRecord(value) || typeof value.name !== 'string') return undefined;
    return {
        name: value.name,
        groups: readList(value.groups, readMembership),
        nodes: readList(value.nodes, readNode),
        meta: isMeta(value.meta) ? value.meta : {}
    };
};

/** A group as the file writes it, without expired nodes. */
export const groupJson = (group: Group, now: number): PermissionGroupJson => ({
    weight: group.weight,
    parents: [...group.parents],
    nodes: group.nodes.filter((node) => !isExpired(node, now)).map(nodeJson),
    meta: { ...group.meta }
});

/** A user as the file writes it, without expired nodes and memberships. */
export const userJson = (user: User, now: number): PermissionUserJson => ({
    name: user.name,
    groups: user.groups.filter((membership) => !isExpired(membership, now)).map(membershipJson),
    nodes: user.nodes.filter((node) => !isExpired(node, now)).map(nodeJson),
    meta: { ...user.meta }
});

const nodeJson = (node: Node): PermissionNodeJson =>
    node.expires === undefined ? { node: node.node } : { node: node.node, expires: node.expires };

const membershipJson = (membership: Membership): PermissionMembershipJson =>
    membership.expires === undefined
        ? { group: membership.group }
        : { group: membership.group, expires: membership.expires };
