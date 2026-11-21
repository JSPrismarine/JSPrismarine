/**
 * NBT paths: `Inventory[0].tag.display.Name`, the addresses `/data` reads and writes.
 *
 * The grammar and the edits are Java Edition's `NbtPathArgument`. A path is a run of nodes,
 * and each node is one of six kinds:
 *
 * | Written         | Node                                                                  |
 * | --------------- | --------------------------------------------------------------------- |
 * | `{…}` (first)   | the root, if it matches the pattern                                   |
 * | `name`, `"a b"` | a compound's entry                                                    |
 * | `name{…}`       | a compound's entry, if it matches the pattern                         |
 * | `[2]`, `[-1]`   | one element of a list or array, counted from the end when negative    |
 * | `[]`            | every element                                                         |
 * | `[{…}]`         | every element of a list that matches the pattern                      |
 *
 * A path can match many tags at once: `Items[].Count` names the count of every item. The
 * edits apply to all of them and return how many tags they changed. That count is what
 * `/data` reports, and when it is zero the command fails.
 *
 * Tags are immutable (see `./tag`), so every edit returns a new root. Inside an edit the root
 * is copied into a mutable draft, changed in place the way Java changes its tags, and frozen
 * again.
 */
import { NbtErrors } from '@jsprismarine/errors/nbt';

import { MAX_DEPTH, formatSnbt, readSnbtAt } from './snbt';
import type { NbtCompoundTag, NbtTag } from './tag';
import {
    byteTag,
    compoundTag,
    entryOf,
    intTag,
    isNumericTag,
    listTag,
    longTag,
    mergeCompounds,
    tagMatches,
    tagsEqual
} from './tag';

/** One step of a path. */
export type NbtPathNode =
    | { readonly kind: 'root'; readonly pattern: NbtCompoundTag }
    | { readonly kind: 'child'; readonly name: string }
    | { readonly kind: 'matchChild'; readonly name: string; readonly pattern: NbtCompoundTag }
    | { readonly kind: 'index'; readonly index: number }
    | { readonly kind: 'all' }
    | { readonly kind: 'matchElement'; readonly pattern: NbtCompoundTag };

/** A parsed path, with the text it was read from for error messages. */
export interface NbtPath {
    readonly text: string;
    readonly nodes: readonly NbtPathNode[];
}

/** How many nodes a path may have, as Java's `NbtPathArgument` limits it. */
const MAX_NODES = 512;

/** A character that ends an unquoted key: whitespace, a separator, a bracket or a quote. */
const KEY_END = /[\s.'"[\]{}]/;

/**
 * Reads a path.
 * @throws {NbtErrors.NbtPathSyntax} When the text is not a path.
 */
export const parseNbtPath = (text: string): NbtPath => {
    const nodes: NbtPathNode[] = [];
    let offset = 0;
    const fail = (reason: string): never => {
        throw new NbtErrors.NbtPathSyntax({ path: text, position: offset, reason });
    };
    /** Reads the SNBT a quoted key or a pattern is written in, failing as a path does. */
    const readEmbedded = (): ReturnType<typeof readSnbtAt> => {
        try {
            return readSnbtAt(text, offset);
        } catch (cause) {
            if (!(cause instanceof NbtErrors.SnbtSyntax)) throw cause;
            throw new NbtErrors.NbtPathSyntax({ path: text, position: offset, reason: cause.message }, { cause });
        }
    };
    const readPattern = (): NbtCompoundTag => {
        const { tag, end } = readEmbedded();
        if (tag.type !== 'compound') fail('expected a compound pattern');
        offset = end;
        return tag.type === 'compound' ? tag : compoundTag();
    };
    const readNamed = (): void => {
        let name = '';
        const quote = text[offset];
        if (quote === '"' || quote === "'") {
            const { tag, end } = readEmbedded();
            name = tag.type === 'string' ? tag.value : '';
            offset = end;
        } else {
            const start = offset;
            while (offset < text.length && !KEY_END.test(text[offset] ?? '')) offset += 1;
            name = text.slice(start, offset);
            if (name.length === 0) fail('expected a key');
        }
        if (text[offset] === '{') nodes.push({ kind: 'matchChild', name, pattern: readPattern() });
        else nodes.push({ kind: 'child', name });
    };
    const readBracket = (): void => {
        offset += 1;
        const next = text[offset];
        if (next === ']') {
            nodes.push({ kind: 'all' });
        } else if (next === '{') {
            nodes.push({ kind: 'matchElement', pattern: readPattern() });
        } else {
            const match = /^-?\d+/.exec(text.slice(offset));
            if (match === null) fail('expected an index, a pattern or ]');
            const digits = match?.[0] ?? '0';
            const index = Number(digits);
            if (!Number.isSafeInteger(index) || index < -(2 ** 31) || index >= 2 ** 31) fail('index out of range');
            nodes.push({ kind: 'index', index });
            offset += digits.length;
        }
        if (text[offset] !== ']') fail("expected ']'");
        offset += 1;
    };

    if (text.startsWith('{')) nodes.push({ kind: 'root', pattern: readPattern() });
    else readNamed();

    while (offset < text.length) {
        const next = text[offset];
        if (next === '[') {
            readBracket();
        } else if (next === '.') {
            offset += 1;
            readNamed();
        } else if (next === '{' && nodes.at(-1)?.kind === 'child') {
            fail('a pattern must follow its key directly');
        } else {
            fail('unexpected character');
        }
        if (nodes.length > MAX_NODES) fail(`more than ${MAX_NODES} nodes`);
    }
    return { text, nodes };
};

/**
 * The tags a path matches in `root`, in document order. Empty when it matches nothing.
 */
export const pathMatches = (root: NbtTag, path: NbtPath): readonly NbtTag[] => {
    let current: readonly NbtTag[] = [root];
    for (const node of path.nodes) current = current.flatMap((tag) => readNode(node, tag));
    return current;
};

/**
 * The one tag a path matches, which is what `/data get` with a path reads.
 * @throws {NbtErrors.NbtPathNothingFound} When it matches nothing.
 * @throws {NbtErrors.NbtPathMultiple} When it matches more than one tag.
 */
export const singleMatch = (root: NbtTag, path: NbtPath): NbtTag => {
    const found = pathMatches(root, path);
    const [only] = found;
    if (only === undefined) throw new NbtErrors.NbtPathNothingFound({ path: path.text });
    if (found.length > 1) throw new NbtErrors.NbtPathMultiple({ path: path.text, count: found.length });
    return only;
};

const readNode = (node: NbtPathNode, tag: NbtTag): readonly NbtTag[] => {
    switch (node.kind) {
        case 'root':
            return tagMatches(node.pattern, tag) ? [tag] : [];
        case 'child': {
            const child = tag.type === 'compound' ? entryOf(tag.value, node.name) : undefined;
            return child === undefined ? [] : [child];
        }
        case 'matchChild': {
            const child = tag.type === 'compound' ? entryOf(tag.value, node.name) : undefined;
            return child !== undefined && tagMatches(node.pattern, child) ? [child] : [];
        }
        case 'index': {
            const elements = elementsOf(tag);
            if (elements === undefined) return [];
            const at = node.index < 0 ? elements.length + node.index : node.index;
            const element = elements[at];
            return element === undefined ? [] : [element];
        }
        case 'all':
            return elementsOf(tag) ?? [];
        case 'matchElement':
            return tag.type === 'list' ? tag.value.filter((element) => tagMatches(node.pattern, element)) : [];
    }
};

/** A collection's elements as tags; an array's numbers become tags of its element type. */
const elementsOf = (tag: NbtTag): readonly NbtTag[] | undefined => {
    switch (tag.type) {
        case 'list':
            return tag.value;
        case 'byte_array':
            return Array.from(tag.value, (value) => byteTag(value));
        case 'int_array':
            return Array.from(tag.value, (value) => intTag(value));
        case 'long_array':
            return Array.from(tag.value, (value) => longTag(value));
        default:
            return undefined;
    }
};

/** The outcome of an edit: the new root and how many tags changed. */
export interface NbtEdit {
    readonly root: NbtCompoundTag;
    readonly changed: number;
}

/** A tag in an edit's mutable draft. A leaf tag is shared, because nothing edits one in place. */
type Draft =
    | { readonly type: 'compound'; readonly value: Map<string, Draft> }
    | { readonly type: 'list'; readonly value: Draft[] }
    | { readonly type: 'byte_array' | 'int_array'; readonly value: number[] }
    | { readonly type: 'long_array'; readonly value: bigint[] }
    | Exclude<NbtTag, { readonly type: 'compound' | 'list' | 'byte_array' | 'int_array' | 'long_array' }>;

type DraftCompound = Extract<Draft, { readonly type: 'compound' }>;

const thaw = (tag: NbtTag): Draft => {
    switch (tag.type) {
        case 'compound':
            return {
                type: 'compound',
                value: new Map(Object.entries(tag.value).map(([key, entry]) => [key, thaw(entry)]))
            };
        case 'list':
            return { type: 'list', value: tag.value.map(thaw) };
        case 'byte_array':
        case 'int_array':
            return { type: tag.type, value: Array.from(tag.value) };
        case 'long_array':
            return { type: 'long_array', value: Array.from(tag.value) };
        default:
            return tag;
    }
};

const freeze = (draft: Draft): NbtTag => {
    switch (draft.type) {
        case 'compound':
            return compoundTag([...draft.value].map(([key, entry]) => [key, freeze(entry)] as const));
        case 'list':
            return listTag(draft.value.map(freeze));
        case 'byte_array':
            return { type: 'byte_array', value: Int8Array.from(draft.value) };
        case 'int_array':
            return { type: 'int_array', value: Int32Array.from(draft.value) };
        case 'long_array':
            return { type: 'long_array', value: BigInt64Array.from(draft.value) };
        default:
            return draft;
    }
};

const freezeCompound = (draft: DraftCompound): NbtCompoundTag =>
    compoundTag([...draft.value].map(([key, entry]) => [key, freeze(entry)] as const));

/** Whether a draft is the same tag as `tag`. */
const sameAs = (draft: Draft, tag: NbtTag): boolean => tagsEqual(freeze(draft), tag);

/** Whether a draft matches a pattern. */
const draftMatches = (pattern: NbtTag, draft: Draft): boolean => tagMatches(pattern, freeze(draft));

/** The empty tag a node prefers as its parent, which a create builds when one is missing. */
const preferredParent = (node: NbtPathNode): Draft =>
    node.kind === 'index' || node.kind === 'all' || node.kind === 'matchElement'
        ? { type: 'list', value: [] }
        : { type: 'compound', value: new Map() };

/** An array element read back as a draft tag of its element type. */
const arrayElement = (
    draft: Extract<Draft, { readonly type: 'byte_array' | 'int_array' | 'long_array' }>,
    at: number
): Draft => {
    if (draft.type === 'long_array') return longTag(draft.value[at] ?? 0n);
    const value = draft.value[at] ?? 0;
    return draft.type === 'byte_array' ? byteTag(value) : intTag(value);
};

/** The draft children a node reaches, without creating any. */
const draftNode = (node: NbtPathNode, draft: Draft): Draft[] => {
    switch (node.kind) {
        case 'root':
            return draftMatches(node.pattern, draft) ? [draft] : [];
        case 'child': {
            const child = draft.type === 'compound' ? draft.value.get(node.name) : undefined;
            return child === undefined ? [] : [child];
        }
        case 'matchChild': {
            const child = draft.type === 'compound' ? draft.value.get(node.name) : undefined;
            return child !== undefined && draftMatches(node.pattern, child) ? [child] : [];
        }
        case 'index': {
            if (draft.type === 'list') {
                const child = draft.value[node.index < 0 ? draft.value.length + node.index : node.index];
                return child === undefined ? [] : [child];
            }
            if (draft.type === 'byte_array' || draft.type === 'int_array' || draft.type === 'long_array') {
                const at = node.index < 0 ? draft.value.length + node.index : node.index;
                return at >= 0 && at < draft.value.length ? [arrayElement(draft, at)] : [];
            }
            return [];
        }
        case 'all':
            if (draft.type === 'list') return [...draft.value];
            if (draft.type === 'byte_array' || draft.type === 'int_array' || draft.type === 'long_array')
                return draft.value.map((_, at) => arrayElement(draft, at));
            return [];
        case 'matchElement':
            return draft.type === 'list' ? draft.value.filter((element) => draftMatches(node.pattern, element)) : [];
    }
};

/** The draft children a node reaches, creating a missing one from `create` where Java does. */
const draftNodeOrCreate = (node: NbtPathNode, draft: Draft, create: () => Draft): Draft[] => {
    switch (node.kind) {
        case 'child': {
            if (draft.type !== 'compound') return [];
            const child = draft.value.get(node.name);
            if (child !== undefined) return [child];
            const made = create();
            draft.value.set(node.name, made);
            return [made];
        }
        case 'matchChild': {
            if (draft.type !== 'compound') return [];
            const child = draft.value.get(node.name);
            if (child === undefined) {
                const made = thaw(node.pattern);
                draft.value.set(node.name, made);
                return [made];
            }
            return draftMatches(node.pattern, child) ? [child] : [];
        }
        case 'all': {
            if (draft.type === 'list' && draft.value.length === 0) {
                const made = create();
                draft.value.push(made);
                return [made];
            }
            return draftNode(node, draft);
        }
        case 'matchElement': {
            if (draft.type !== 'list') return [];
            const matching = draftNode(node, draft);
            if (matching.length > 0) return matching;
            const made = thaw(node.pattern);
            draft.value.push(made);
            return [made];
        }
        default:
            return draftNode(node, draft);
    }
};

const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

/**
 * A float or a double as Java's `longValue()` reads it, `(long) Math.floor(value)`: rounded down,
 * saturated at the ends of the range, and NaN as 0.
 */
const flooredLong = (value: number): bigint => {
    if (Number.isNaN(value)) return 0n;
    if (value >= 2 ** 63) return LONG_MAX;
    if (value < -(2 ** 63)) return LONG_MIN;
    return BigInt(Math.floor(value));
};

/**
 * A float or a double as Java's `intValue()` reads it, `Mth.floor`: rounded down, saturated at
 * the ends of the int range, and NaN as 0.
 */
const flooredInt = (value: number): number =>
    Number.isNaN(value) ? 0 : Math.min(Math.max(Math.floor(value), -(2 ** 31)), 2 ** 31 - 1);

/**
 * A tag converted to an array's element value as Java's `NumericTag` converts it, or undefined
 * when it is not a number. A long narrows by wrapping; a float or a double rounds down first.
 */
const arrayValueOf = (type: 'byte_array' | 'int_array' | 'long_array', tag: NbtTag): number | bigint | undefined => {
    if (!isNumericTag(tag)) return undefined;
    if (type === 'long_array') return tag.type === 'long' ? tag.value : flooredLong(tag.value);
    const value = tag.type === 'long' ? Number(BigInt.asIntN(32, tag.value)) : flooredInt(tag.value);
    return type === 'byte_array' ? byteTag(value).value : intTag(value).value;
};

/** Whether writing `value` at `at` leaves the collection as it is, judged after an array converts it. */
const sameElement = (parent: Draft, at: number, old: Draft, value: NbtTag): boolean => {
    if (parent.type === 'byte_array' || parent.type === 'int_array' || parent.type === 'long_array') {
        const converted = arrayValueOf(parent.type, value);
        return converted !== undefined && parent.value[at] === converted;
    }
    return sameAs(old, value);
};

/** Writes one element of a collection. @returns Whether the collection took the value. */
const setElement = (draft: Draft, at: number, tag: NbtTag): boolean => {
    if (draft.type === 'list') {
        draft.value[at] = thaw(tag);
        return true;
    }
    if (draft.type === 'long_array') {
        const value = arrayValueOf('long_array', tag);
        if (typeof value !== 'bigint') return false;
        draft.value[at] = value;
        return true;
    }
    if (draft.type === 'byte_array' || draft.type === 'int_array') {
        const value = arrayValueOf(draft.type, tag);
        if (typeof value !== 'number') return false;
        draft.value[at] = value;
        return true;
    }
    return false;
};

/** Inserts into a collection. @returns Whether the collection took the value. */
const insertElement = (draft: Draft, at: number, tag: NbtTag): boolean => {
    if (draft.type === 'list') {
        draft.value.splice(at, 0, thaw(tag));
        return true;
    }
    if (draft.type === 'long_array') {
        const value = arrayValueOf('long_array', tag);
        if (typeof value !== 'bigint') return false;
        draft.value.splice(at, 0, value);
        return true;
    }
    if (draft.type === 'byte_array' || draft.type === 'int_array') {
        const value = arrayValueOf(draft.type, tag);
        if (typeof value !== 'number') return false;
        draft.value.splice(at, 0, value);
        return true;
    }
    return false;
};

/** Writes `value` where the last node points inside `parent`. @returns How many tags changed. */
const setNode = (node: NbtPathNode, parent: Draft, value: NbtTag): number => {
    switch (node.kind) {
        case 'child': {
            if (parent.type !== 'compound') return 0;
            const old = parent.value.get(node.name);
            parent.value.set(node.name, thaw(value));
            return old !== undefined && sameAs(old, value) ? 0 : 1;
        }
        case 'matchChild': {
            if (parent.type !== 'compound') return 0;
            const old = parent.value.get(node.name);
            if (old === undefined || !draftMatches(node.pattern, old) || sameAs(old, value)) return 0;
            parent.value.set(node.name, thaw(value));
            return 1;
        }
        case 'index': {
            const elements = draftNode({ kind: 'all' }, parent);
            const at = node.index < 0 ? elements.length + node.index : node.index;
            const old = elements[at];
            if (old === undefined || sameElement(parent, at, old, value)) return 0;
            return setElement(parent, at, value) ? 1 : 0;
        }
        case 'all': {
            const elements = draftNode(node, parent);
            if (elements.length === 0) return insertElement(parent, 0, value) ? 1 : 0;
            let changed = 0;
            elements.forEach((old, at) => {
                if (!sameElement(parent, at, old, value) && setElement(parent, at, value)) changed += 1;
            });
            return changed;
        }
        case 'matchElement': {
            if (parent.type !== 'list') return 0;
            if (parent.value.length === 0) {
                parent.value.push(thaw(value));
                return 1;
            }
            let changed = 0;
            parent.value.forEach((old, at) => {
                if (draftMatches(node.pattern, old) && !sameAs(old, value)) {
                    parent.value[at] = thaw(value);
                    changed += 1;
                }
            });
            return changed;
        }
        case 'root':
            return 0;
    }
};

/** Removes what the last node points at inside `parent`. @returns How many tags went. */
const removeNode = (node: NbtPathNode, parent: Draft): number => {
    switch (node.kind) {
        case 'child':
            return parent.type === 'compound' && parent.value.delete(node.name) ? 1 : 0;
        case 'matchChild': {
            if (parent.type !== 'compound') return 0;
            const child = parent.value.get(node.name);
            if (child === undefined || !draftMatches(node.pattern, child)) return 0;
            parent.value.delete(node.name);
            return 1;
        }
        case 'index': {
            if (
                parent.type !== 'list' &&
                parent.type !== 'byte_array' &&
                parent.type !== 'int_array' &&
                parent.type !== 'long_array'
            )
                return 0;
            const at = node.index < 0 ? parent.value.length + node.index : node.index;
            if (at < 0 || at >= parent.value.length) return 0;
            parent.value.splice(at, 1);
            return 1;
        }
        case 'all': {
            if (
                parent.type !== 'list' &&
                parent.type !== 'byte_array' &&
                parent.type !== 'int_array' &&
                parent.type !== 'long_array'
            )
                return 0;
            const removed = parent.value.length;
            parent.value.length = 0;
            return removed;
        }
        case 'matchElement': {
            if (parent.type !== 'list') return 0;
            const kept = parent.value.filter((element) => !draftMatches(node.pattern, element));
            const removed = parent.value.length - kept.length;
            parent.value.splice(0, parent.value.length, ...kept);
            return removed;
        }
        case 'root': {
            if (parent.type !== 'compound' || !draftMatches(node.pattern, parent)) return 0;
            const removed = parent.value.size;
            parent.value.clear();
            return removed;
        }
    }
};

/** Splits a path into the nodes leading to the parents and the last node. */
const lastOf = (path: NbtPath): { readonly leading: readonly NbtPathNode[]; readonly last: NbtPathNode } => {
    const last = path.nodes.at(-1);
    if (last === undefined) throw new NbtErrors.NbtPathSyntax({ path: path.text, position: 0, reason: 'empty path' });
    return { leading: path.nodes.slice(0, -1), last };
};

/** Walks the leading nodes, creating each missing parent as the node after it prefers. */
const parentsOrCreate = (root: Draft, path: NbtPath, leading: readonly NbtPathNode[]): Draft[] => {
    let current: Draft[] = [root];
    leading.forEach((node, at) => {
        const next = path.nodes[at + 1];
        current = current.flatMap((draft) =>
            draftNodeOrCreate(node, draft, () =>
                next === undefined ? { type: 'compound', value: new Map() } : preferredParent(next)
            )
        );
    });
    return current;
};

/** How far below a tag its deepest descendant sits: 0 for a tag with no children. */
const depthBelow = (tag: NbtTag): number => {
    const children = tag.type === 'compound' ? Object.values(tag.value) : tag.type === 'list' ? tag.value : [];
    return children.reduce((deepest, child) => Math.max(deepest, 1 + depthBelow(child)), 0);
};

/**
 * The edited root, refused when it nests deeper than {@link MAX_DEPTH}, which the SNBT reader
 * would refuse to read back. Java's `NbtPathArgument` refuses such an edit the same way.
 * @throws {NbtErrors.NbtPathTooDeep} When the edit nests too deep.
 */
const edited = (root: NbtCompoundTag, draft: DraftCompound, changed: number): NbtEdit => {
    if (changed === 0) return { root, changed };
    const result = freezeCompound(draft);
    if (depthBelow(result) > MAX_DEPTH) throw new NbtErrors.NbtPathTooDeep();
    return { root: result, changed };
};

/** Thaws a compound root for an edit. */
const thawRoot = (root: NbtCompoundTag): DraftCompound => ({
    type: 'compound',
    value: new Map(Object.entries(root.value).map(([key, entry]) => [key, thaw(entry)]))
});

/**
 * Writes `value` at every place the path names, creating missing compounds and lists on the
 * way, which is `/data modify … set`.
 */
export const setAtPath = (root: NbtCompoundTag, path: NbtPath, value: NbtTag): NbtEdit => {
    const draft = thawRoot(root);
    const { leading, last } = lastOf(path);
    let changed = 0;
    for (const parent of parentsOrCreate(draft, path, leading)) changed += setNode(last, parent, value);
    return edited(root, draft, changed);
};

/** Removes every tag the path names, which is `/data remove`. */
export const removeAtPath = (root: NbtCompoundTag, path: NbtPath): NbtEdit => {
    const draft = thawRoot(root);
    const { leading, last } = lastOf(path);
    let parents: Draft[] = [draft];
    for (const node of leading) parents = parents.flatMap((parent) => draftNode(node, parent));
    let changed = 0;
    for (const parent of parents) changed += removeNode(last, parent);
    return { root: changed === 0 ? root : freezeCompound(draft), changed };
};

/** The tags a path names, creating a missing last one from `create`. */
const targetsOrCreate = (draft: Draft, path: NbtPath, create: () => Draft): Draft[] => {
    const { leading, last } = lastOf(path);
    return parentsOrCreate(draft, path, leading).flatMap((parent) => draftNodeOrCreate(last, parent, create));
};

/**
 * Inserts `values` into every list or array the path names, creating a missing list,
 * which is `/data modify … append`, `prepend` and `insert`.
 *
 * @param index - Where to insert. A negative index counts from the end, so -1 appends.
 * @throws {NbtErrors.NbtPathExpectedList} When the path names something that is not a list or array.
 * @throws {NbtErrors.NbtPathInvalidIndex} When the index is outside a collection, or an array
 *   cannot hold a value.
 */
export const insertAtPath = (
    root: NbtCompoundTag,
    path: NbtPath,
    index: number,
    values: readonly NbtTag[]
): NbtEdit => {
    const draft = thawRoot(root);
    let changed = 0;
    for (const target of targetsOrCreate(draft, path, () => ({ type: 'list', value: [] }))) {
        if (
            target.type !== 'list' &&
            target.type !== 'byte_array' &&
            target.type !== 'int_array' &&
            target.type !== 'long_array'
        )
            throw new NbtErrors.NbtPathExpectedList({ got: formatSnbt(freeze(target)) });
        const size = target.value.length;
        const at = index < 0 ? size + index + 1 : index;
        if (at < 0 || at > size) throw new NbtErrors.NbtPathInvalidIndex({ index });
        let offset = 0;
        for (const value of values) {
            if (!insertElement(target, at + offset, value)) throw new NbtErrors.NbtPathInvalidIndex({ index });
            offset += 1;
        }
        if (values.length > 0) changed += 1;
    }
    return edited(root, draft, changed);
};

/**
 * Merges `value` into every compound the path names, creating a missing one, which is
 * `/data modify … merge`.
 *
 * @throws {NbtErrors.NbtPathExpectedObject} When the path names something that is not a compound.
 */
export const mergeAtPath = (root: NbtCompoundTag, path: NbtPath, value: NbtCompoundTag): NbtEdit => {
    const draft = thawRoot(root);
    let changed = 0;
    for (const target of targetsOrCreate(draft, path, () => ({ type: 'compound', value: new Map() }))) {
        if (target.type !== 'compound') throw new NbtErrors.NbtPathExpectedObject({ got: formatSnbt(freeze(target)) });
        const before = freezeCompound(target);
        const merged = mergeCompounds(before, value);
        if (tagsEqual(before, merged)) continue;
        target.value.clear();
        for (const [key, entry] of Object.entries(merged.value)) target.value.set(key, thaw(entry));
        changed += 1;
    }
    return edited(root, draft, changed);
};
