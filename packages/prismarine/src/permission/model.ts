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

/** Whether something with an expiry has expired at `now`, in milliseconds since the epoch. An expiry that does not parse counts as expired. */
export const isExpired = ({ expires }: { readonly expires?: string }, now: number): boolean => {
    if (expires === undefined) return false;
    const at = Date.parse(expires);
    return Number.isNaN(at) || at <= now;
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
 * Checks an expiry: an ISO 8601 instant in the future.
 * @throws InvalidPermissionExpiry when it does not parse or is already past.
 */
export const checkExpiry = (expires: string, now: number): string => {
    const at = Date.parse(expires);
    if (Number.isNaN(at) || at <= now) throw new PrismarineServerErrors.InvalidPermissionExpiry({ expires });
    return new Date(at).toISOString();
};

/** Whether a value is a map of string to string. */
const isMeta = (value: unknown): value is Record<string, string> =>
    isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');

/** The node an entry of the file holds, or undefined for one that is not a node. */
const readNode = (value: unknown): Node | undefined => {
    if (!isRecord(value) || typeof value.node !== 'string') return undefined;
    return typeof value.expires === 'string' ? { node: value.node, expires: value.expires } : { node: value.node };
};

const readMembership = (value: unknown): Membership | undefined => {
    if (!isRecord(value) || typeof value.group !== 'string') return undefined;
    return typeof value.expires === 'string' ? { group: value.group, expires: value.expires } : { group: value.group };
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
