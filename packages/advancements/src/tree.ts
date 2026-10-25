import { DiagnosticCollector } from '@jsprismarine/predicates';
import type { Diagnostic } from '@jsprismarine/predicates';

import type { ParsedAdvancement } from './model';

/** One advancement in the tree, with its resolved parent and children. */
export interface AdvancementNode {
    readonly id: string;
    readonly advancement: ParsedAdvancement;
    /** Absent on a root, and on a node whose `parent` could not be resolved. */
    readonly parent?: AdvancementNode;
    readonly children: readonly AdvancementNode[];
}

/** Every advancement, linked by `parent`. */
export interface AdvancementTree {
    /** Nodes with no parent, in the order the advancements were given. */
    readonly roots: readonly AdvancementNode[];
    readonly nodes: ReadonlyMap<string, AdvancementNode>;
}

interface MutableNode {
    readonly id: string;
    readonly advancement: ParsedAdvancement;
    parent?: MutableNode;
    readonly children: MutableNode[];
}

/**
 * Walks up from a node and returns the identifier the walk revisits, or
 * undefined when the chain reaches a root.
 */
const cycleFrom = (start: MutableNode): string | undefined => {
    const seen = new Set<string>([start.id]);
    let node = start.parent;
    while (node) {
        if (seen.has(node.id)) return node.id;
        seen.add(node.id);
        node = node.parent;
    }
    return undefined;
};

/**
 * Links parsed advancements into the tree the client draws as tabs.
 *
 * A `parent` that names nothing in the set reports and leaves the node a root,
 * so an incomplete datapack still produces a usable tree. A `parent` chain
 * that closes on itself reports at the first node whose walk revisits an
 * identifier and detaches that node, which breaks the cycle, keeps the rest of
 * the chain linked, and stops any later walk from looping.
 *
 * @param advancements - The parsed files, which decide root ordering.
 * @returns The tree together with every fault found while linking it.
 */
export const buildAdvancementTree = (
    advancements: Iterable<ParsedAdvancement>,
    collector: DiagnosticCollector = new DiagnosticCollector()
): { readonly tree: AdvancementTree; readonly diagnostics: readonly Diagnostic[] } => {
    const nodes = new Map<string, MutableNode>();
    for (const advancement of advancements) {
        nodes.set(advancement.id, { id: advancement.id, advancement, children: [] });
    }

    for (const node of nodes.values()) {
        const parentId = node.advancement.parent;
        if (parentId === undefined) continue;

        const parent = nodes.get(parentId);
        if (!parent) {
            collector.error(node.id, `parent ${parentId} is not a loaded advancement`);
            continue;
        }
        node.parent = parent;
    }

    for (const node of nodes.values()) {
        const cycle = cycleFrom(node);
        if (cycle === undefined) continue;
        collector.error(node.id, `parent chain is cyclic through ${cycle}`);
        node.parent = undefined;
    }

    const roots: MutableNode[] = [];
    for (const node of nodes.values()) {
        if (node.parent) node.parent.children.push(node);
        else roots.push(node);
    }

    return { tree: { roots, nodes }, diagnostics: collector.entries };
};
