/**
 * How a subject's permissions and meta resolve ([the permissions plan](../../../../docs/plans/permissions.md)).
 *
 * Resolution walks tiers of nodes: the user's own, then each group the user holds directly,
 * heaviest first, and each group's parents depth first behind it. The first tier that decides the
 * query wins. Within a tier a specific node decides before a wildcard, and a negation decides
 * before a grant at the same specificity. Meta resolves over the same tiers, first value wins.
 */
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type { Group, Node, User } from './model';
import { DEFAULT_GROUP, EMPTY_GROUP, isExpired, LEVEL_META, OPERATOR_GROUP } from './model';

/** What resolution reads: one subject's user record, the groups by name, and the moment. */
export interface PermissionView {
    /** The subject's own record, or undefined for one the file does not know. */
    readonly user: User | undefined;
    /** Whether the subject is an operator, which holds the `operator` group. */
    readonly isOp: boolean;
    /** The group of this name, or undefined when the file has none. */
    groupOf(name: string): Group | undefined;
    /** Now, in milliseconds since the epoch, for expiry. */
    readonly now: number;
}

/** A node's grant or negation, and its name without the `-`. */
const meaningOf = (node: Node): { readonly name: string; readonly negated: boolean } =>
    node.node.startsWith('-') ? { name: node.node.slice(1), negated: true } : { name: node.node, negated: false };

/**
 * How specifically a node names a query, or undefined when it does not match: an exact match
 * ranks above every scope, and a longer scope above a shorter one. `*` is the shortest scope, and
 * a bare `scope.name` covers `scope.name.*` as the checks always have.
 */
const specificity = (name: string, query: string): number | undefined => {
    if (name === query) return Number.POSITIVE_INFINITY;
    if (name === '*') return 0;
    const scope = name.endsWith('.*') ? name.slice(0, -2) : name;
    return query.startsWith(`${scope}.`) ? scope.split('.').length : undefined;
};

/** What one tier says about a query, or undefined when none of its nodes names it. */
const decideTier = (nodes: readonly Node[], query: string, now: number): boolean | undefined => {
    let best: { specificity: number; negated: boolean } | undefined;
    for (const node of nodes) {
        if (isExpired(node, now)) continue;
        const { name, negated } = meaningOf(node);
        const rank = specificity(name, query);
        if (rank === undefined) continue;
        if (best === undefined || rank > best.specificity) best = { specificity: rank, negated };
        else if (rank === best.specificity && negated) best.negated = true;
    }
    return best === undefined ? undefined : !best.negated;
};

/**
 * The groups a subject holds directly, heaviest first: the memberships that have not expired,
 * `default` for everyone and `operator` for an operator. Two groups of one weight keep the order
 * the memberships list them in, with the built-in groups last.
 */
export const directGroupsOf = (view: PermissionView): string[] => {
    const names: string[] = [];
    for (const membership of view.user?.groups ?? []) {
        if (!isExpired(membership, view.now) && !names.includes(membership.group)) names.push(membership.group);
    }
    if (!names.includes(DEFAULT_GROUP)) names.push(DEFAULT_GROUP);
    if (view.isOp && !names.includes(OPERATOR_GROUP)) names.push(OPERATOR_GROUP);
    const weightOf = (name: string): number => view.groupOf(name)?.weight ?? EMPTY_GROUP.weight;
    // A stable sort, so equal weights keep their listed order.
    return names
        .map((name, index) => ({ name, index }))
        .sort((a, b) => weightOf(b.name) - weightOf(a.name) || a.index - b.index)
        .map(({ name }) => name);
};

/** The heaviest group the subject holds directly. */
export const primaryGroupOf = (view: PermissionView): string => directGroupsOf(view)[0] ?? DEFAULT_GROUP;

/**
 * Walks the tiers in resolution order: the user, then each direct group and its parents depth
 * first. A group reached twice is visited once, which also ends a parent cycle.
 */
const tiersOf = function* (
    view: PermissionView
): Generator<{ readonly nodes: readonly Node[]; readonly meta: Readonly<Record<string, string>> }> {
    if (view.user !== undefined) yield view.user;
    const visited = new Set<string>();
    const visit = function* (name: string): Generator<Group> {
        if (visited.has(name)) return;
        visited.add(name);
        const group = view.groupOf(name);
        if (group === undefined) return;
        yield group;
        for (const parent of group.parents) yield* visit(parent);
    };
    for (const name of directGroupsOf(view)) yield* visit(name);
};

/**
 * Whether the subject holds a node after resolution.
 * @returns True for a grant, false for a negation or for a node nothing names.
 */
export const hasPermission = (view: PermissionView, node: string): boolean => {
    for (const tier of tiersOf(view)) {
        const decision = decideTier(tier.nodes, node, view.now);
        if (decision !== undefined) return decision;
    }
    return false;
};

/** The resolved value of a meta key, or undefined when nothing sets it. */
export const metaOf = (view: PermissionView, key: string): string | undefined => {
    for (const tier of tiersOf(view)) {
        const value = tier.meta[key];
        if (value !== undefined) return value;
    }
    return undefined;
};

/** Every node that applies to the subject, in resolution order, without expired ones. */
export const nodesOf = (view: PermissionView): string[] => {
    const nodes: string[] = [];
    for (const tier of tiersOf(view)) {
        for (const node of tier.nodes) if (!isExpired(node, view.now)) nodes.push(node.node);
    }
    return nodes;
};

/** The command levels a `level` meta may name. */
const LEVELS: readonly CommandPermissionLevel[] = [
    CommandPermissionLevel.ANY,
    CommandPermissionLevel.GAME_DIRECTORS,
    CommandPermissionLevel.ADMIN,
    CommandPermissionLevel.HOST,
    CommandPermissionLevel.OWNER
];

/** The level a `level` meta value names, or undefined for one outside 0 to 4. */
export const levelOf = (value: string | undefined): CommandPermissionLevel | undefined => {
    if (value === undefined) return undefined;
    const level = Number(value);
    return LEVELS.find((known) => known === level);
};

/**
 * The subject's command level: the larger of the `level` meta, read as 0 to 4, and 4 for an
 * operator. A `level` outside 0 to 4 reads as unset.
 */
export const commandLevelOf = (view: PermissionView): CommandPermissionLevel => {
    const fromMeta = levelOf(metaOf(view, LEVEL_META)) ?? CommandPermissionLevel.ANY;
    return view.isOp ? Math.max(fromMeta, CommandPermissionLevel.OWNER) : fromMeta;
};
